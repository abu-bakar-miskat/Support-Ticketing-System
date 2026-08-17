import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest } from "@/lib/api-response"
import { isValidEmailFormat } from "@/lib/email-validation"
import { brandingFrom, getEmailConfig } from "@/lib/email-config"
import { getUserSignature } from "@/lib/email"
import { renderScreeningInvite, SCREENING_BRAND_COLORS, SCREENING_FROM_EMAIL } from "@/lib/email-templates/screening-invite"
import { BASE_URL, escapeHtml, layout } from "@/lib/email-templates/_shared"
import { drawInviteQuestions, getActiveQuestions } from "@/lib/screening/question-bank"
import { syncScreeningToBoard } from "@/lib/screening/board-sync"
import { DEFAULT_EXPIRY_DAYS, generateScreeningToken } from "@/lib/screening/session"

const LINK_PLACEHOLDER = "[SCREENING LINK]"

/** Minimal HTML rendering of a hand-edited plain-text email body. */
function editedBodyToHtml(text: string, url: string): string {
  const paragraphs = text.split(/\n{2,}/).map((block) => {
    const html = escapeHtml(block).replace(/\n/g, "<br />")
    return `<p style="margin:0 0 16px 0;">${html}</p>`
  })
  const linked = paragraphs
    .join("\n")
    .replaceAll(escapeHtml(url), `<a href="${url}" style="color:#0269af;">${url}</a>`)
  return linked
}

/** Create a screening invite: session + seeded answer rows + emailed link. */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager(
    "Only admins and managers can send screening invites.",
  )
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const candidateName = typeof body.candidateName === "string" ? body.candidateName.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const roleTitle = typeof body.roleTitle === "string" ? body.roleTitle.trim() : ""
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : null
  const emailSubject =
    typeof body.emailSubject === "string" && body.emailSubject.trim()
      ? body.emailSubject.trim()
      : null
  const emailBody =
    typeof body.emailBody === "string" && body.emailBody.trim() ? body.emailBody : null
  const expiryDays =
    typeof body.expiryDays === "number" && body.expiryDays >= 1 && body.expiryDays <= 30
      ? Math.floor(body.expiryDays)
      : DEFAULT_EXPIRY_DAYS

  if (!candidateName) return badRequest("Candidate name is required.")
  if (!isValidEmailFormat(email)) return badRequest("A valid candidate email is required.")
  if (!roleTitle) return badRequest("Role title is required.")

  if (candidateId) {
    const activeDeptId = await resolveActiveDeptId(profile)
    const candidate = await prisma.recruitmentCandidate.findFirst({
      where: { id: candidateId, board: { ...recruitmentBoardWhere(profile, activeDeptId) } },
      select: { id: true },
    })
    if (!candidate) return badRequest("Recruitment candidate not found.")
  }

  const activeQuestions = await getActiveQuestions()
  if (activeQuestions.length === 0) return badRequest("No active screening questions — add at least one first.")
  const questions = drawInviteQuestions(activeQuestions)

  const token = generateScreeningToken()

  const session = await prisma.screeningSession.create({
    data: {
      candidateId,
      candidateName,
      email,
      roleTitle,
      token,
      createdById: profile?.id ?? null,
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      answers: {
        create: questions.map((q, i) => ({
          questionKey: q.id,
          position: i + 1,
          prompt: q.prompt,
          hint: q.hint,
          rubric: q.rubric,
        })),
      },
    },
    select: { id: true, token: true },
  })

  const url = `${BASE_URL}/screen/${token}`

  // Stamp the linked candidate's "Screening Sent Date" / "Screening Video"
  // board columns (best-effort; score lands later when scoring completes).
  await syncScreeningToBoard(session.id)

  // Send the invite email. A rejected send shouldn't orphan the session —
  // the link is returned either way so the sender can share it manually.
  let emailSent = false
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const config = await getEmailConfig()
      const branding = { ...brandingFrom(config), ...SCREENING_BRAND_COLORS }
      const signature = profile ? await getUserSignature(profile.id) : null

      let subject: string
      let html: string
      let text: string
      if (emailBody) {
        // Hand-edited in the invite form; substitute the placeholder with the
        // real link (append it if the sender deleted the placeholder).
        const withLink = emailBody.includes(LINK_PLACEHOLDER)
          ? emailBody.replaceAll(LINK_PLACEHOLDER, url)
          : `${emailBody.trimEnd()}\n\nStart here: ${url}`
        subject = emailSubject ?? `Next step — ${roleTitle} at PEN Group`
        text = withLink
        html = layout({
          heading: `Next step for the ${escapeHtml(roleTitle)} role`,
          bodyHtml: editedBodyToHtml(withLink, url),
          branding,
        })
      } else {
        const rendered = renderScreeningInvite({
          candidateName,
          roleTitle,
          token,
          expiryDays,
          questionCount: questions.length,
          senderName: profile?.name,
          signature,
          branding,
        })
        subject = emailSubject ?? rendered.subject
        html = rendered.html
        text = rendered.text
      }

      const result = await resend.emails.send({
        // The sending address is pinned to onboarding@ regardless of the
        // workspace-wide from address, but the display name is the sender's,
        // and replies go to their real inbox — so to the candidate it reads
        // and behaves as a personal email.
        from: `${profile?.name || config.fromName} <${SCREENING_FROM_EMAIL}>`,
        to: email,
        replyTo: profile?.email || config.replyTo || undefined,
        subject,
        html,
        text,
      })
      if (result.error) {
        console.error("[screening] invite email rejected:", result.error.message)
      } else {
        emailSent = true
        if (result.data?.id) {
          await prisma.screeningSession.update({
            where: { id: session.id },
            data: { resendEmailId: result.data.id, emailStatus: "sent", emailStatusAt: new Date() },
          })
        }
      }
    } catch (err) {
      console.error("[screening] invite email failed:", err)
    }
  }

  return NextResponse.json({ id: session.id, url, emailSent }, { status: 201 })
}
