import "server-only";
import { prisma } from "@/lib/db";
import { getPullMailProvider, MailProviderError, PULL_AUTH_TYPES, type PullMailProvider } from "@/lib/mail-providers";
import type { PullContext } from "@/lib/mail-providers/types";
import { pullContextFor, recordMailboxConnectionFailure } from "@/lib/mailbox-connection";
import { processNormalizedInboundEmail } from "@/lib/process-inbound-email";

/**
 * EM-05 pull ingestion: polls OAUTH_M365 mailboxes and
 * feeds each new message through the same provider-agnostic pipeline the
 * Resend webhook uses (threading, dedupe, suppression, ticket creation).
 *
 * Delivery is at-least-once: the cursor is persisted after each message is
 * processed, so a crash re-reads at most one message, and the pipeline's
 * Message-ID dedupe makes that re-read a no-op.
 */

/** Messages processed per mailbox per run; the rest wait for the next run. */
const BATCH_LIMIT = 20;
/** Lease length — longer than one sync can take, so a crashed run self-heals. */
const LEASE_MS = 4 * 60_000;
/** Mailboxes synced in parallel per sweep. */
const CONCURRENCY = 4;
/** A message that keeps failing in the pipeline is skipped after this many runs,
 *  so one malformed email can't block the whole mailbox forever. */
const MAX_MESSAGE_ATTEMPTS = 3;

/**
 * Stored `syncCursor`: the provider's own cursor (`v`) plus retry bookkeeping
 * for the message currently failing in the pipeline.
 */
type StoredCursor = { v: unknown; retry?: { id: string; attempts: number } };

function readStoredCursor(value: unknown): StoredCursor | null {
  if (value === null || value === undefined) return null;
  return typeof value === "object" && "v" in (value as object) ? (value as StoredCursor) : { v: value };
}

/**
 * The cursor to store when a pull mailbox is first connected: "now", so the
 * mailbox's existing history is never imported, but nothing that arrives
 * between connecting and the first cron run is missed either.
 */
export async function initialSyncCursor(provider: PullMailProvider, ctx: PullContext): Promise<StoredCursor> {
  return { v: await provider.initialCursor(ctx) };
}

export type MailboxSyncResult = { processed: number; skipped?: "locked" | "not_pull" | "failing"; error?: string };

export async function syncMailboxConnection(connectionId: string, now: Date = new Date()): Promise<MailboxSyncResult> {
  // Lease: only one run may sync a mailbox at a time (overlapping cron runs,
  // or a manual "Test connection" racing the cron).
  const lease = await prisma.mailboxConnection.updateMany({
    where: {
      id: connectionId,
      authType: { in: [...PULL_AUTH_TYPES] },
      OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }],
    },
    data: { syncLockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (lease.count === 0) return { processed: 0, skipped: "locked" };

  let processed = 0;
  try {
    const connection = await prisma.mailboxConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: {
        id: true, address: true, authType: true, credentialsRef: true, syncCursor: true,
        status: true, failureCount: true, departmentId: true,
      },
    });
    const provider = getPullMailProvider(connection.authType);
    if (!provider) return { processed: 0, skipped: "not_pull" };
    // A failing connection is retried by the health-check backoff; sync
    // resumes automatically once that check flips it back to ACTIVE.
    if (connection.status !== "ACTIVE") return { processed: 0, skipped: "failing" };

    const stored = readStoredCursor(connection.syncCursor);
    const saveCursor = (cursor: StoredCursor) =>
      prisma.mailboxConnection.update({ where: { id: connectionId }, data: { syncCursor: cursor as never } });

    try {
      let ctx;
      try {
        ctx = pullContextFor(connection);
      } catch (err) {
        throw new MailProviderError(err instanceof Error ? err.message : "Stored credentials are unreadable — reconnect the mailbox", "auth");
      }

      if (!stored) {
        // First sync after connecting: start from "now", never import history.
        await saveCursor({ v: await provider.initialCursor(ctx) });
      } else {
        const batch = await provider.fetchNewMessages(ctx, stored.v, BATCH_LIMIT);
        for (const { email, cursorAfter } of batch.messages) {
          // No Message-ID header (rare, malformed senders) — fall back to a
          // provider-scoped id so dedupe still holds across re-reads.
          const messageId = email.messageId || `${connection.authType.toLowerCase()}.${connection.id}.${email.providerMessageId}`;
          try {
            await processNormalizedInboundEmail({
              email,
              messageId,
              recipients: [connection.address],
              mailboxConnectionId: connection.id,
            });
          } catch (err) {
            const attempts = (stored.retry?.id === email.providerMessageId ? stored.retry.attempts : 0) + 1;
            if (attempts < MAX_MESSAGE_ATTEMPTS) {
              // Leave the cursor on this message so the next run retries it.
              await saveCursor({ v: stored.v, retry: { id: email.providerMessageId, attempts } });
              throw err;
            }
            console.error(`[mailbox-sync] giving up on message ${email.providerMessageId} at ${connection.address} after ${attempts} attempts:`, err);
          }
          stored.v = cursorAfter;
          stored.retry = undefined;
          await saveCursor({ v: cursorAfter });
          processed++;
        }
        if (batch.cursor !== undefined) await saveCursor({ v: batch.cursor });
      }
    } catch (err) {
      // Provider failures (expired grant, server down) mark the connection as
      // failing so admins see it and managers are alerted. A pipeline error on
      // one message just stops this batch — the cursor still points at it, so
      // the next run retries it.
      if (err instanceof MailProviderError) {
        await recordMailboxConnectionFailure(connection, err.message, now, {
          status: err.kind === "auth" ? "AUTH_ERROR" : "UNREACHABLE",
        });
      }
      console.error(`[mailbox-sync] ${connection.address} failed after ${processed} message(s):`, err);
      return { processed, error: err instanceof Error ? err.message : String(err) };
    }

    await prisma.mailboxConnection.update({ where: { id: connectionId }, data: { lastSyncedAt: now } });
    return { processed };
  } finally {
    await prisma.mailboxConnection
      .update({ where: { id: connectionId }, data: { syncLockedUntil: null } })
      .catch(() => undefined);
  }
}

/**
 * Cron entry point. Paused mailboxes are still synced: the pipeline records
 * their mail in the received-mail view without opening tickets, matching how
 * Resend mailboxes behave while turned off.
 */
export async function sweepMailboxSync(now: Date = new Date()): Promise<{ mailboxes: number; processed: number }> {
  const due = await prisma.mailboxConnection.findMany({
    where: { authType: { in: [...PULL_AUTH_TYPES] }, status: "ACTIVE" },
    select: { id: true },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
  });

  let processed = 0;
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const results = await Promise.all(
      due.slice(i, i + CONCURRENCY).map(({ id }) =>
        syncMailboxConnection(id, now).catch((err) => {
          console.error("[mailbox-sync] unexpected failure for", id, err);
          return { processed: 0 };
        }),
      ),
    );
    processed += results.reduce((sum, r) => sum + r.processed, 0);
  }
  return { mailboxes: due.length, processed };
}
