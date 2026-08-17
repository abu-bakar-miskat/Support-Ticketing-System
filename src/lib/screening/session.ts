import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/** URL-safe invite token — this is the candidate's only credential. */
export function generateScreeningToken(): string {
  return randomBytes(32).toString("base64url");
}

export const DEFAULT_EXPIRY_DAYS = 7;

/** R2 object key for one take. Segments are strictly [a-z0-9_-] so the key is
 *  safe in signed URLs without encoding surprises. */
export function screeningObjectKey(
  sessionId: string,
  questionKey: string,
  take: number,
  ext: "webm" | "mp4",
): string {
  return `screening/${sessionId}/${questionKey}-take${take}.${ext}`;
}

/** An uploaded object key is only acceptable if it belongs to this session —
 *  the candidate proves ownership via prefix. Whether the question key names a
 *  real answer row is checked by the caller against the session's answers. */
export function isSessionObjectKey(sessionId: string, objectKey: string): boolean {
  const m = objectKey.match(
    /^screening\/([^/]+)\/([a-z0-9_]+)-take(\d+)\.(webm|mp4)$/,
  );
  if (!m) return false;
  return m[1] === sessionId;
}

export type LiveSessionResult =
  | {
      ok: true;
      session: NonNullable<Awaited<ReturnType<typeof findSessionByToken>>>;
    }
  | { ok: false; reason: "not_found" | "expired" | "submitted" };

function findSessionByToken(token: string) {
  return prisma.screeningSession.findUnique({
    where: { token },
    include: { answers: { orderBy: { position: "asc" } } },
  });
}

/**
 * Load a session a candidate is allowed to act on. Lazily flips status to
 * `expired` when past expiry (no cron needed). Submitted/scored sessions are
 * locked.
 */
export async function getLiveSessionByToken(
  token: string,
): Promise<LiveSessionResult> {
  if (!token || token.length > 100) return { ok: false, reason: "not_found" };
  const session = await findSessionByToken(token);
  if (!session) return { ok: false, reason: "not_found" };

  if (session.status === "submitted" || session.status === "scored") {
    return { ok: false, reason: "submitted" };
  }
  if (session.status === "expired") return { ok: false, reason: "expired" };

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.screeningSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return { ok: false, reason: "expired" };
  }

  return { ok: true, session };
}
