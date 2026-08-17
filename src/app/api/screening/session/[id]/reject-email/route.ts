import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { requireAdminOrManager, screeningSessionWhere } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { brandingFrom, getEmailConfig } from "@/lib/email-config"
import { SCREENING_BRAND_COLORS, SCREENING_FROM_EMAIL } from "@/lib/email-templates/screening-invite"
import { escapeHtml, layout } from "@/lib/email-templates/_shared"
import { draftRejectionEmail } from "@/lib/screening/reject-email"

export const maxDuration = 60

/** Minimal HTML rendering of a plain-text email body. */
function bodyToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px 0;">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n")
}

/**
 * Rejection email for a screening candidate. `{ action: "draft" }` returns an
 * AI-drafted subject/body with feedback distilled from the screening
 * assessments (editable before sending); `{ action: "send", subject, body }`
 * sends it — from onboarding@ with the reviewer's display name and reply-to,
 * like the invite. Managers can only touch invites they sent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager(
    "Only admins and managers can send rejection emails.",
  )
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const session = await prisma.screeningSession.findFirst({
    where: { id, ...screeningSessionWhere(profile) },
    include: { answers: { orderBy: { position: "asc" } } },
  })
  if (!session) return notFound("Session not found.")

  if (body.action === "draft") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return badRequest("AI drafting isn't configured in this environment.")
    }
    const draft = await draftRejectionEmail({
      candidateName: session.candidateName,
      roleTitle: session.roleTitle,
      senderName: profile.name,
      answers: session.answers
        .filter((a) => a.score !== null)
        .map((a) => ({
          prompt: a.prompt ?? a.questionKey,
          score: a.score as number,
          reasoning: a.reasoning,
        })),
    })
    return NextResponse.json({ ...draft, to: session.email })
  }

  if (body.action === "send") {
    const subject = typeof body.subject === "string" ? body.subject.trim() : ""
    const emailBody = typeof body.body === "string" ? body.body.trim() : ""
    if (!subject || !emailBody) return badRequest("subject and body are required.")
    if (!process.env.RESEND_API_KEY) {
      return badRequest("Email isn't configured in this environment.")
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const config = await getEmailConfig()
    const branding = { ...brandingFrom(config), ...SCREENING_BRAND_COLORS }
    const html = layout({
      heading: `Your application for ${escapeHtml(session.roleTitle)}`,
      bodyHtml: bodyToHtml(emailBody),
      branding,
    })

    const result = await resend.emails.send({
      // Same identity trick as the invite: platform address, reviewer's name
      // and inbox — the candidate reads it as a personal email.
      from: `${profile.name || config.fromName} <${SCREENING_FROM_EMAIL}>`,
      to: session.email,
      // CC the sender so they have the sent email in their own inbox.
      cc: profile.email || undefined,
      replyTo: profile.email || config.replyTo || undefined,
      subject,
      html,
      text: emailBody,
    })
    if (result.error) return badRequest(`Email rejected: ${result.error.message}`)
    return NextResponse.json({ ok: true })
  }

  return badRequest('Expected { action: "draft" } or { action: "send", subject, body }.')
}
