import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { requireAdminOrManager, screeningSessionWhere } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound, unauthorized } from "@/lib/api-response"
import { scoreSession, scoringConfigured } from "@/lib/screening/scoring"

export const maxDuration = 300

function secretMatches(provided: string | null): boolean {
  const secret = process.env.SCREENING_SCORING_SECRET
  if (!secret || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Internal scoring job. Accepts either the shared secret (for machine
 * triggers/retries) or an admin/manager session (the "re-run scoring" button
 * on the review page — managers only for sessions they created).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
  const force = body.force === true
  if (!sessionId) return badRequest("sessionId is required.")

  const viaSecret = secretMatches(request.headers.get("x-screening-secret"))
  if (!viaSecret) {
    const { profile, error } = await requireAdminOrManager(
      "Only admins and managers can trigger scoring.",
    )
    if (error) return unauthorized("Invalid scoring secret.")
    const owned = await prisma.screeningSession.findFirst({
      where: { id: sessionId, ...screeningSessionWhere(profile) },
      select: { id: true },
    })
    if (!owned) return notFound("Session not found.")
  }

  if (!scoringConfigured()) {
    return NextResponse.json(
      { error: "Scoring is not configured (ANTHROPIC_API_KEY / OPENAI_API_KEY missing)." },
      { status: 503 },
    )
  }

  try {
    const result = await scoreSession(sessionId, { force })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed." },
      { status: 500 },
    )
  }
}
