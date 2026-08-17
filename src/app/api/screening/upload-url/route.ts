import { NextRequest, NextResponse } from "next/server"
import { badRequest, notFound } from "@/lib/api-response"
import { MAX_TAKES } from "@/lib/screening/questions"
import { getLiveSessionByToken, screeningObjectKey } from "@/lib/screening/session"
import { presignR2Put, r2Configured } from "@/lib/screening/r2"

/**
 * Candidate route — the token is the auth. Returns a short-lived presigned PUT
 * URL so the recording goes browser → R2 and never touches this server.
 */
export async function POST(request: NextRequest) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === "string" ? body.token : ""
  const questionKey = typeof body.questionKey === "string" ? body.questionKey : ""
  const contentType = body.contentType === "video/mp4" ? "video/mp4" : "video/webm"

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

  const answer = result.session.answers.find((a) => a.questionKey === questionKey)
  if (!answer) return notFound("Answer not found.")

  // Frame-sheet presign: stills sampled during recording, stored next to the
  // video they belong to. The candidate can only reference keys under their
  // own session prefix.
  if (typeof body.frameFor === "string") {
    const frameIndex = Number.isInteger(body.frameIndex) ? body.frameIndex : -1
    if (frameIndex < 0 || frameIndex > 7) return badRequest("Invalid frame index.")
    if (
      !body.frameFor.startsWith(`screening/${result.session.id}/${questionKey}-take`) ||
      !/^[a-zA-Z0-9/_.-]+\.(webm|mp4)$/.test(body.frameFor)
    ) {
      return badRequest("Invalid object key.")
    }
    const frameKey = body.frameFor.replace(/\.(webm|mp4)$/, `-frame${frameIndex}.jpg`)
    return NextResponse.json({ url: presignR2Put(frameKey, 600), objectKey: frameKey })
  }

  if (answer.takesUsed >= MAX_TAKES) {
    return badRequest("No takes remaining for this question.")
  }

  const take = answer.takesUsed + 1
  const ext = contentType === "video/mp4" ? "mp4" : "webm"
  const objectKey = screeningObjectKey(result.session.id, questionKey, take, ext)

  return NextResponse.json({
    url: presignR2Put(objectKey, 600),
    objectKey,
    take,
  })
}
