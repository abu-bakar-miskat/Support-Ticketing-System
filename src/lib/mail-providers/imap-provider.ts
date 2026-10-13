import "server-only";
import { ImapFlow } from "imapflow";
import { parseRawMime } from "./mime";
import {
  MailProviderError,
  type ImapMailboxCredentials,
  type PullBatch,
  type PullMailProvider,
} from "./types";

/** Cursor: the highest INBOX UID processed, valid only for one UIDVALIDITY epoch. */
type ImapCursor = { uidValidity: string; lastUid: number };

function readImapCursor(value: unknown): ImapCursor | null {
  const cursor = value as Partial<ImapCursor> | null;
  return cursor && typeof cursor.uidValidity === "string" && typeof cursor.lastUid === "number"
    ? { uidValidity: cursor.uidValidity, lastUid: cursor.lastUid }
    : null;
}

function toProviderError(err: unknown): MailProviderError {
  if (err instanceof MailProviderError) return err;
  const e = err as { authenticationFailed?: boolean; responseText?: string; message?: string; code?: string };
  if (e?.authenticationFailed) {
    return new MailProviderError(`IMAP sign-in failed${e.responseText ? `: ${e.responseText}` : ""}`, "auth");
  }
  return new MailProviderError(e?.responseText || e?.message || e?.code || "Couldn't reach the IMAP server");
}

/** Opens a read-only INBOX session, runs `fn`, and always logs out. */
async function withInbox<T>(
  credentials: ImapMailboxCredentials,
  fn: (client: ImapFlow, mailbox: { uidValidity: bigint; uidNext: number }) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  });
  // A dropped socket emits 'error' outside any awaited call; without a
  // listener Node would treat it as an uncaught exception.
  client.on("error", () => undefined);
  try {
    await client.connect();
    // Read-only: polling must never mark customer mail as seen or move it.
    const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    return await fn(client, mailbox);
  } catch (err) {
    throw toProviderError(err);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Validates credentials by signing in and opening INBOX; used before saving a new connection. */
export async function verifyImapCredentials(credentials: ImapMailboxCredentials): Promise<void> {
  await withInbox(credentials, async () => undefined);
}

/**
 * Generic IMAP mailbox (Exchange on-prem, cPanel, Zoho, Yahoo app passwords…).
 * Tracks INBOX by UID; a UIDVALIDITY change (mailbox rebuilt server-side)
 * restarts the cursor at the current end instead of re-importing everything.
 */
export const imapProvider: PullMailProvider<ImapMailboxCredentials> = {
  authType: "IMAP",

  async initialCursor(ctx) {
    return withInbox(ctx.credentials, async (_client, mailbox) => ({
      uidValidity: String(mailbox.uidValidity),
      lastUid: Math.max(0, mailbox.uidNext - 1),
    } satisfies ImapCursor));
  },

  async fetchNewMessages(ctx, rawCursor, limit): Promise<PullBatch> {
    return withInbox(ctx.credentials, async (client, mailbox) => {
      const uidValidity = String(mailbox.uidValidity);
      const cursor = readImapCursor(rawCursor);
      if (!cursor || cursor.uidValidity !== uidValidity) {
        return { messages: [], cursor: { uidValidity, lastUid: Math.max(0, mailbox.uidNext - 1) } satisfies ImapCursor };
      }
      if (mailbox.uidNext - 1 <= cursor.lastUid) return { messages: [] };

      // `n:*` always matches the highest UID even when it is below n, so filter.
      const uids = ((await client.search({ uid: `${cursor.lastUid + 1}:*` }, { uid: true })) || [])
        .filter((uid) => uid > cursor.lastUid)
        .sort((a, b) => a - b)
        .slice(0, limit);

      const messages = [];
      for (const uid of uids) {
        const fetched = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        const cursorAfter: ImapCursor = { uidValidity, lastUid: uid };
        // Expunged between search and fetch — just move past it.
        if (!fetched || !fetched.source) continue;
        messages.push({ email: await parseRawMime(fetched.source, `imap:${uidValidity}:${uid}`), cursorAfter });
      }
      return { messages, cursor: uids.length > 0 ? { uidValidity, lastUid: uids[uids.length - 1] } : undefined };
    });
  },

  async checkHealth(ctx) {
    try {
      await verifyImapCredentials(ctx.credentials);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach the IMAP server" };
    }
  },
};

/** Parses and validates the IMAP settings the connect form posts as `plaintextCredentials`. */
export function parseImapCredentials(input: unknown): ImapMailboxCredentials | { error: string } {
  const raw = (() => {
    if (typeof input !== "string") return input;
    try { return JSON.parse(input) as unknown; } catch { return null; }
  })() as Partial<Record<keyof ImapMailboxCredentials, unknown>> | null;
  if (!raw || typeof raw !== "object") return { error: "IMAP settings are required" };

  const host = typeof raw.host === "string" ? raw.host.trim() : "";
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const port = Number(raw.port ?? 993);
  const secure = raw.secure === undefined ? port === 993 : raw.secure === true;
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) return { error: "Enter a valid IMAP server host name" };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "Enter a valid IMAP port" };
  if (!username || !password) return { error: "IMAP username and password are required" };
  return { kind: "imap", host, port, secure, username, password };
}
