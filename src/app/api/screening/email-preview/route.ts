import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { getUserSignature } from "@/lib/email"
import { renderScreeningInvite } from "@/lib/email-templates/screening-invite"
import { getActiveQuestions, QUESTIONS_PER_INVITE } from "@/lib/screening/question-bank"
import { DEFAULT_EXPIRY_DAYS } from "@/lib/screening/session"

const LINK_PLACEHOLDER = "[SCREENING LINK]"

/**
 * Renders the invite email for the form's preview/editor. The real link only
 * exists once the invite is created, so the URL is swapped for a placeholder
 * the send route substitutes back.
 */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const candidateName =
    typeof body.candidateName === "string" && body.candidateName.trim()
      ? body.candidateName.trim()
      : "Candidate"
  const roleTitle =
    typeof body.roleTitle === "string" && body.roleTitle.trim() ? body.roleTitle.trim() : ""
  const expiryDays =
    typeof body.expiryDays === "number" && body.expiryDays >= 1 && body.expiryDays <= 30
      ? Math.floor(body.expiryDays)
      : DEFAULT_EXPIRY_DAYS
  if (!roleTitle) return badRequest("Role title is required.")

  const questions = await getActiveQuestions()
  const signature = profile ? await getUserSignature(profile.id) : null
  const rendered = renderScreeningInvite({
    candidateName,
    roleTitle,
    token: "__TOKEN__",
    expiryDays,
    questionCount: Math.min(questions.length, QUESTIONS_PER_INVITE),
    senderName: profile?.name,
    signature,
  })

  // Both the button URL and the fallback line contain the tokenised link.
  const linkPattern = /https?:\/\/\S*__TOKEN__/g
  return NextResponse.json({
    subject: rendered.subject,
    text: rendered.text.replace(linkPattern, LINK_PLACEHOLDER),
  })
}
