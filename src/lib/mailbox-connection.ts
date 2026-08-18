import "server-only";
import { prisma } from "@/lib/db";
import { encryptMailboxCredentials } from "@/lib/mailbox-credentials";
import { getMailProvider } from "@/lib/mail-providers";
import { createNotification } from "@/lib/notify";
import { sendMailboxConnectionFailedAlertEmail } from "@/lib/email";
import type { MailboxAuthType, MailboxScopeType } from "@/generated/prisma/enums";

/**
 * MailboxConnection CRUD + routing + EM-07 health monitoring (slice 14).
 *
 * `credentialsRef` (NFR-03: encrypted at rest, never returned by any API) is
 * deliberately excluded from every `select` below — not just omitted by the
 * caller — so a future call site can't accidentally leak it by forgetting to
 * strip a field.
 */

const SAFE_SELECT = {
  id: true,
  tenantId: true,
  departmentId: true,
  teamId: true,
  scopeType: true,
  address: true,
  authType: true,
  status: true,
  failureCount: true,
  lastCheckedAt: true,
  lastErrorAt: true,
  lastErrorMessage: true,
  nextCheckAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type MailboxConnectionSafe = {
  id: string;
  tenantId: string;
  departmentId: string;
  teamId: string;
  scopeType: MailboxScopeType;
  address: string;
  authType: MailboxAuthType;
  status: "ACTIVE" | "AUTH_ERROR" | "UNREACHABLE";
  failureCount: number;
  lastCheckedAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  nextCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listMailboxConnections(departmentId: string): Promise<MailboxConnectionSafe[]> {
  return prisma.mailboxConnection.findMany({
    where: { departmentId },
    select: SAFE_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export async function createMailboxConnection(params: {
  tenantId: string;
  departmentId: string;
  teamId: string;
  scopeType: MailboxScopeType;
  address: string;
  authType: MailboxAuthType;
  /** Plaintext, encrypted before storage. Omit/null for RESEND (uses the platform API key). */
  plaintextCredentials?: string | null;
}): Promise<MailboxConnectionSafe> {
  const credentialsRef = params.plaintextCredentials
    ? encryptMailboxCredentials(params.plaintextCredentials)
    : null;

  return prisma.mailboxConnection.create({
    data: {
      tenantId: params.tenantId,
      departmentId: params.departmentId,
      teamId: params.teamId,
      scopeType: params.scopeType,
      address: params.address.trim().toLowerCase(),
      authType: params.authType,
      credentialsRef,
    },
    select: SAFE_SELECT,
  });
}

export async function updateMailboxConnection(
  id: string,
  params: { address?: string; plaintextCredentials?: string | null },
): Promise<MailboxConnectionSafe> {
  return prisma.mailboxConnection.update({
    where: { id },
    data: {
      ...(params.address !== undefined ? { address: params.address.trim().toLowerCase() } : {}),
      ...(params.plaintextCredentials !== undefined
        ? { credentialsRef: params.plaintextCredentials ? encryptMailboxCredentials(params.plaintextCredentials) : null }
        : {}),
    },
    select: SAFE_SELECT,
  });
}

export async function deleteMailboxConnection(id: string): Promise<void> {
  await prisma.mailboxConnection.delete({ where: { id } });
}

/** Strips display-name/angle-bracket wrapping and lowercases, matching extractReplyToken's tolerance. */
function normalizeRecipientAddress(recipient: string): string {
  const angle = recipient.match(/<([^>]+)>/);
  return (angle ? angle[1] : recipient).trim().toLowerCase();
}

export type MailboxRoute = {
  id: string;
  address: string;
  tenantId: string;
  departmentId: string;
  teamId: string;
};

/**
 * EM-01/02/03: resolve which (if any) configured mailbox a fresh inbound
 * message landed in, so a brand-new ticket can be filed on the right
 * department/sub-department board. Exact address match only — Resend's
 * inbound domain is shared, so `address` is purely a routing key checked
 * against the webhook's recipient list.
 */
export async function findMailboxRouteForRecipients(recipients: string[]): Promise<MailboxRoute | null> {
  const candidates = [...new Set(recipients.map(normalizeRecipientAddress))].filter(Boolean);
  if (candidates.length === 0) return null;

  return prisma.mailboxConnection.findFirst({
    where: { address: { in: candidates } },
    select: { id: true, address: true, tenantId: true, departmentId: true, teamId: true },
  });
}

/**
 * EM-06: records a suppressed auto-generated inbound message (bounce/OOO/
 * Auto-Submitted) that arrived at a connected mailbox with no matching
 * ticket — there is, by definition, no ticket to attach it to, so it goes
 * here instead. Best-effort — never throws.
 */
export async function logMailSuppression(params: {
  tenantId: string;
  mailboxConnectionId: string;
  providerMessageId: string;
  fromEmail: string | null;
  toAddress: string | null;
  subject: string | null;
  reason: string;
}): Promise<void> {
  try {
    await prisma.mailSuppressionLog.create({ data: params });
  } catch {
    // best-effort
  }
}

// ─── EM-07: connection health + exponential backoff ────────────────────────

/** Backoff schedule in minutes after each consecutive failure (capped at the last step). */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 1440];

function nextBackoffMinutes(failureCount: number): number {
  const idx = Math.min(failureCount, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx];
}

/**
 * Checks one connection via its provider and updates status/backoff state.
 * On the FIRST failure after being healthy, notifies the department's
 * managers immediately (EM-07: "within one polling cycle"). Best-effort —
 * never throws, so one bad connection can't abort the sweep.
 */
export async function checkMailboxConnectionHealth(connectionId: string, now: Date = new Date()): Promise<void> {
  try {
    const connection = await prisma.mailboxConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        authType: true,
        credentialsRef: true,
        status: true,
        failureCount: true,
        departmentId: true,
        address: true,
      },
    });
    if (!connection) return;

    const provider = getMailProvider(connection.authType);
    const result = provider
      ? await provider.checkHealth({ credentialsRef: connection.credentialsRef })
      : { ok: false as const, error: `No provider implementation for ${connection.authType}` };

    if (result.ok) {
      await prisma.mailboxConnection.update({
        where: { id: connectionId },
        data: {
          status: "ACTIVE",
          failureCount: 0,
          lastCheckedAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
          nextCheckAt: null,
        },
      });
      return;
    }

    const wasHealthy = connection.status === "ACTIVE";
    const failureCount = connection.failureCount + 1;
    const backoffMinutes = nextBackoffMinutes(failureCount);

    await prisma.mailboxConnection.update({
      where: { id: connectionId },
      data: {
        status: "AUTH_ERROR",
        failureCount,
        lastCheckedAt: now,
        lastErrorAt: now,
        lastErrorMessage: result.error,
        nextCheckAt: new Date(now.getTime() + backoffMinutes * 60_000),
      },
    });

    if (wasHealthy) {
      await notifyMailboxConnectionFailure(connection.departmentId, connection.address, result.error);
    }
  } catch {
    // best-effort — a health-check failure must never crash the sweep
  }
}

async function notifyMailboxConnectionFailure(departmentId: string, address: string, error: string): Promise<void> {
  const managers = await prisma.departmentManager.findMany({
    where: { departmentId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  for (const { user } of managers) {
    createNotification({
      recipientId: user.id,
      type: "mailbox_connection_failed",
      message: `Mailbox connection ${address} failed: ${error}`,
    }).catch(() => undefined);

    sendMailboxConnectionFailedAlertEmail({
      to: user.email,
      managerName: user.name,
      address,
      error,
    }).catch(() => undefined);
  }
}

/**
 * Cron entry point: re-checks every connection due for a check — ACTIVE ones
 * on every sweep, failing ones only once their backoff window has elapsed —
 * so a persistently broken mailbox doesn't get hammered every cycle.
 */
export async function sweepMailboxConnectionHealth(now: Date = new Date()): Promise<{ checked: number }> {
  const due = await prisma.mailboxConnection.findMany({
    where: { OR: [{ status: "ACTIVE" }, { nextCheckAt: { lte: now } }] },
    select: { id: true },
  });
  for (const { id } of due) {
    await checkMailboxConnectionHealth(id, now);
  }
  return { checked: due.length };
}
