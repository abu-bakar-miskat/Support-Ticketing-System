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

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Upper bound on candidate ids listed per sync; anything beyond waits for the next run. */
const MAX_LISTED = 100;

async function gmailFetch(ctx: PullContext<OAuthMailboxCredentials>, url: string): Promise<Response> {
  const token = await getAccessToken("google", ctx.credentials, ctx.saveCredentials);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? `Gmail returned HTTP ${res.status}`;
  throw new MailProviderError(message, res.status === 401 || res.status === 403 ? "auth" : "unreachable");
}

/**
 * Gmail / Google Workspace mailbox read via the Gmail API (gmail.readonly).
 * Lists Inbox ids received since the cursor, reads each one's `internalDate`
 * (cheap `format=minimal`), then downloads only the new ones as raw MIME.
 */
export const googleProvider: PullMailProvider<OAuthMailboxCredentials> = {
  authType: "OAUTH_GOOGLE",

  async initialCursor() {
    return initialTimeCursor();
  },

  async fetchNewMessages(ctx, rawCursor, limit): Promise<PullBatch> {
    const cursor: TimeCursor = readTimeCursor(rawCursor);
    // `after:` is second-granular and exclusive — step back a second and let
    // the cursor's timestamp/id filter drop what was already processed.
    const afterSeconds = Math.floor(Date.parse(cursor.since) / 1000) - 1;
    const query = new URLSearchParams({ q: `in:inbox after:${afterSeconds}`, maxResults: String(MAX_LISTED) });
    const list = (await (await gmailFetch(ctx, `${GMAIL}/messages?${query}`)).json()) as {
      messages?: { id: string }[];
    };

    // Chunked to stay well inside Gmail's per-user rate limit.
    const ids = (list.messages ?? []).map((m) => m.id);
    const candidates = [];
    for (let i = 0; i < ids.length; i += 10) {
      candidates.push(...await Promise.all(ids.slice(i, i + 10).map(async (id) => {
        const meta = (await (await gmailFetch(ctx, `${GMAIL}/messages/${id}?format=minimal`)).json()) as {
          internalDate: string;
        };
        return { id, receivedAt: new Date(Number(meta.internalDate)).toISOString() };
      })));
    }
    const refs = selectNewRefs(cursor, candidates, limit);

    const messages = [];
    let current = cursor;
    for (const ref of refs) {
      const full = (await (await gmailFetch(ctx, `${GMAIL}/messages/${ref.id}?format=raw`)).json()) as { raw: string };
      current = advanceTimeCursor(current, ref);
      messages.push({ email: await parseRawMime(Buffer.from(full.raw, "base64url"), ref.id), cursorAfter: current });
    }
    return { messages };
  },

  async checkHealth(ctx) {
    try {
      await gmailFetch(ctx, `${GMAIL}/profile`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Gmail" };
    }
  },
};
