import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { getLiveSessionByToken } from "@/lib/screening/session"
import { scoreSession, scoringConfigured } from "@/lib/screening/scoring"

export const maxDuration = 300

/**
 * Candidate route — locks the session and kicks off scoring. Transcription is
 * 20-60s per answer, so scoring runs after the response via `after()`; the
 * candidate sees the thank-you immediately. If scoring misses (deploy, crash,
 * missing keys) it is re-runnable from the review page via /api/screening/score.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === "string" ? body.token : ""

  const result = await getLiveSessionByToken(token)
  if (!result.ok) {
    if (result.reason === "not_found") return notFound("This link is not valid.")
    if (result.reason === "submitted") {
      // Idempotent: submitting twice is fine, the first one won.
      return NextResponse.json({ ok: true })
    }
    return badRequest("This screening link has expired.")
  }
  const session = result.session

  const unanswered = session.answers.filter((a) => !a.objectKey)
  if (unanswered.length > 0) {
    return badRequest("All questions must be answered before submitting.")
  }

  await prisma.screeningSession.update({
    where: { id: session.id },
    data: { status: "submitted", submittedAt: new Date(), scoringAttemptAt: new Date() },
  })

  if (scoringConfigured()) {
    after(async () => {
      try {
        const res = await scoreSession(session.id)
        if (res.failed.length > 0) {
          console.error("[screening] scoring partially failed:", res.failed)
        }
      } catch (err) {
        console.error("[screening] scoring failed:", err)
      }
    })
  } else {
    console.warn("[screening] scoring not configured; session left unscored:", session.id)
  }

  return NextResponse.json({ ok: true })
}
