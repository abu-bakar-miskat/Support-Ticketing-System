import "server-only";
import { getAccessToken } from "@/lib/mailbox-oauth";
import { parseRawMime } from "./mime";
import { advanceTimeCursor, initialTimeCursor, readTimeCursor, selectNewRefs, type TimeCursor } from "./time-cursor";
import {
  MailProviderError,
  type OAuthMailboxCredentials,
  type PullBatch,
  type PullContext,
  type PullMailProvider,
} from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

/** `/me` for the signed-in account's own inbox, `/users/{address}` for a shared mailbox it can read. */
function mailboxBase(credentials: OAuthMailboxCredentials): string {
  return credentials.mailbox && credentials.mailbox !== credentials.account
    ? `${GRAPH}/users/${encodeURIComponent(credentials.mailbox)}`
    : `${GRAPH}/me`;
}

async function graphFetch(ctx: PullContext<OAuthMailboxCredentials>, url: string): Promise<Response> {
  const token = await getAccessToken("microsoft", ctx.credentials, ctx.saveCredentials);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? `Microsoft Graph returned HTTP ${res.status}`;
  throw new MailProviderError(message, res.status === 401 || res.status === 403 || res.status === 404 ? "auth" : "unreachable");
}

/**
 * Microsoft 365 / Outlook.com mailbox read via Microsoft Graph. Polls the
 * Inbox by `receivedDateTime` and downloads each message's raw MIME (`$value`)
 * so headers, threading ids and attachments arrive exactly as sent.
 */
export const m365Provider: PullMailProvider<OAuthMailboxCredentials> = {
  authType: "OAUTH_M365",

  async initialCursor() {
    return initialTimeCursor();
  },

  async fetchNewMessages(ctx, rawCursor, limit): Promise<PullBatch> {
    const cursor: TimeCursor = readTimeCursor(rawCursor);
    const base = mailboxBase(ctx.credentials);
    const query = new URLSearchParams({
      $filter: `receivedDateTime ge ${cursor.since}`,
      $orderby: "receivedDateTime asc",
      $select: "id,receivedDateTime",
      $top: String(limit + cursor.ids.length),
    });
    const list = (await (await graphFetch(ctx, `${base}/mailFolders/inbox/messages?${query}`)).json()) as {
      value: { id: string; receivedDateTime: string }[];
    };
    const refs = selectNewRefs(
      cursor,
      list.value.map((m) => ({ id: m.id, receivedAt: m.receivedDateTime })),
      limit,
    );

    const messages = [];
    let current = cursor;
    for (const ref of refs) {
      const raw = Buffer.from(await (await graphFetch(ctx, `${base}/messages/${encodeURIComponent(ref.id)}/$value`)).arrayBuffer());
      current = advanceTimeCursor(current, ref);
      messages.push({ email: await parseRawMime(raw, ref.id), cursorAfter: current });
    }
    return { messages };
  },

  async checkHealth(ctx) {
    try {
      await graphFetch(ctx, `${mailboxBase(ctx.credentials)}/mailFolders/inbox?$select=id`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Microsoft 365" };
    }
  },
};
