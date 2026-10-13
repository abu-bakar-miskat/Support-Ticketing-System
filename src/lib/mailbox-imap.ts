import "server-only";
import { imapProvider, parseImapCredentials, verifyImapCredentials } from "@/lib/mail-providers/imap-provider";
import { MailProviderError, type ImapMailboxCredentials } from "@/lib/mail-providers/types";
import { initialSyncCursor } from "@/lib/mailbox-sync";
import type { PullMailProvider } from "@/lib/mail-providers";

/**
 * Validates IMAP settings posted by the connect form and proves they work
 * (signs in and opens INBOX) before anything is saved, so an admin gets the
 * server's error immediately instead of a failing connection later.
 */
export async function prepareImapConnection(
  plaintextCredentials: unknown,
): Promise<{ ok: true; credentials: ImapMailboxCredentials; syncCursor: unknown } | { ok: false; error: string }> {
  const parsed = parseImapCredentials(plaintextCredentials);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await verifyImapCredentials(parsed);
    const ctx = { credentials: parsed, saveCredentials: async () => undefined };
    const syncCursor = await initialSyncCursor(imapProvider as PullMailProvider, ctx);
    return { ok: true, credentials: parsed, syncCursor };
  } catch (err) {
    return { ok: false, error: err instanceof MailProviderError ? err.message : "Couldn't connect to the IMAP server" };
  }
}
