import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { MAX_TAKES, RECORD_SECONDS } from "@/lib/screening/questions"
import { getLiveSessionByToken, isSessionObjectKey } from "@/lib/screening/session"

/**
 * Candidate route — records that an answer finished uploading to R2. Called
 * right after the presigned PUT succeeds, so a dropped connection later costs
 * nothing: reopening the link resumes at the first unanswered question.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === "string" ? body.token : ""
  const questionKey = typeof body.questionKey === "string" ? body.questionKey : ""
  const objectKey = typeof body.objectKey === "string" ? body.objectKey : ""
  const durationSec =
    typeof body.durationSec === "number" && body.durationSec >= 0
      ? Math.min(Math.round(body.durationSec), RECORD_SECONDS + 5)
      : null

  if (!/^[a-z0-9_]+$/.test(questionKey)) return badRequest("Unknown question.")

  const result = await getLiveSessionByToken(token)
  if (!result.ok) {
    if (result.reason === "not_found") return notFound("This link is not valid.")
    return badRequest(
      result.reason === "expired"
        ? "This screening link has expired."
        : "This screening has already been submitted.",
    )
  }
  const session = result.session

  // The candidate can only claim objects under their own session prefix.
  if (!isSessionObjectKey(session.id, objectKey) || !objectKey.includes(`/${questionKey}-take`)) {
    return badRequest("Invalid object key.")
  }

  const answer = session.answers.find((a) => a.questionKey === questionKey)
  if (!answer) return notFound("Answer not found.")

  const frameCount =
    typeof body.frameCount === "number" && Number.isInteger(body.frameCount)
      ? Math.min(Math.max(body.frameCount, 0), 8)
      : 0

  await prisma.screeningAnswer.update({
    where: { id: answer.id },
    data: {
      objectKey,
      durationSec,
      takesUsed: Math.min(answer.takesUsed + 1, MAX_TAKES),
      uploadedAt: new Date(),
      frameCount,
      // A re-take invalidates the previous take's gaze verdict.
      gazeVerdict: null,
      gazeReasoning: null,
    },
  })

  if (session.status === "sent") {
    await prisma.screeningSession.update({
      where: { id: session.id },
      data: { status: "started", startedAt: session.startedAt ?? new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
