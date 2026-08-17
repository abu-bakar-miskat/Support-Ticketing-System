import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { TicketPriority } from "@/generated/prisma/client"
import { sendIntakeVerificationEmail } from "@/lib/email"
import { isValidEmailFormat, domainAcceptsMail } from "@/lib/email-validation"
import { generateReplyToken } from "@/lib/customer-conversation"
import { createTicketFromPayload, type PendingPayload, type ResponseEntry } from "@/lib/intake-finalize"
import { BASE_URL, ensureAbsoluteUrl } from "@/lib/email-templates/_shared"
import { withSystemScope } from "@/lib/request-scope"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

// Public support-form submission — anonymous requester. Runs under system scope
// so intake conversion (which reads team/dept and creates cross-tenant tickets)
// doesn't fail closed on the tenant extension.
export const POST = withSystemScope(handlePost)

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: uuid },
    include: { fields: { orderBy: { order: "asc" } } },
  })

  if (!form || !form.isActive) {
    return NextResponse.json({ error: "Form unavailable" }, { status: 400 })
  }

  const body = await request.json()
  const submitterName = (body.submitterName as string)?.trim()
  const submitterEmail = (body.submitterEmail as string)?.trim().toLowerCase()
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const priority = typeof body.priority === "string" ? body.priority : null
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : null
  const responses: ResponseEntry[] = Array.isArray(body.responses) ? body.responses : []
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : null

  // ── Basic validation ────────────────────────────────────────────────────────
  if (!submitterName || !submitterEmail) {
    return NextResponse.json(
      { error: "submitterName and submitterEmail are required" },
      { status: 400 },
    )
  }

  // ── Email validation: format + deliverability (both FORM and CHAT modes) ──────
  // Enforced server-side so it can't be bypassed by skipping the client/assist
  // checks. Format is a hard reject; MX is only a hard reject when DNS
  // definitively says the domain can't receive mail (null = transient, accept).
  if (!isValidEmailFormat(submitterEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  if ((await domainAcceptsMail(submitterEmail)) === false) {
    const domain = submitterEmail.split("@")[1] ?? ""
    return NextResponse.json(
      { error: `"${domain}" can't receive email — please double-check your address.` },
      { status: 400 },
    )
  }

  if (priority && !VALID_PRIORITIES.has(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 })
  }

  // ── Required field validation ───────────────────────────────────────────────
  const responseMap = new Map(responses.map((r) => [r.fieldId, r.value]))
  const missingIds = form.fields
    .filter((f) => f.isRequired)
    .filter((f) => {
      const val = responseMap.get(f.id)
      return !val || !val.trim()
    })
    .map((f) => f.id)

  if (missingIds.length > 0) {
    return NextResponse.json({ error: "Required fields missing", missingIds }, { status: 400 })
  }

  // ── Idempotency: a verified submission already became a ticket ───────────────
  if (idempotencyKey) {
    const existing = await prisma.$queryRaw<{ id: string; "ticketId": string | null }[]>`
      SELECT id, "ticketId" FROM "Intake"
      WHERE "formConfigId" = ${uuid}
        AND responses::jsonb @> ${JSON.stringify([{ _ikey: idempotencyKey }])}::jsonb
      LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ id: existing[0].id, duplicate: true })
    }
  }

  const payload: PendingPayload = {
    submitterName,
    submitterEmail,
    title,
    priority,
    issueId,
    responses,
    idempotencyKey,
  }

  // ── Skip verification for already-trusted addresses ──────────────────────────
  // An email owned by an active account is already proven (they signed in via
  // SSO to create it), and an external email that completed the double opt-in
  // once is recorded in VerifiedEmail. Either way, create the ticket immediately
  // rather than sending another link.
  const [account, verified] = await Promise.all([
    prisma.profile.findFirst({
      where: {
        email: { equals: submitterEmail, mode: "insensitive" },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    }),
    prisma.verifiedEmail.findUnique({ where: { email: submitterEmail } }),
  ])

  if (account || verified) {
    try {
      const { ticketId, humanId } = await createTicketFromPayload(uuid, payload)
      return NextResponse.json({ pending: false, ticketId, humanId }, { status: 201 })
    } catch (err) {
      console.error("[intake submit] direct creation failed:", err)
      return NextResponse.json({ error: "Failed to create submission" }, { status: 500 })
    }
  }

  const verify = async (token: string) =>
    sendIntakeVerificationEmail({
      to: submitterEmail,
      submitterName,
      formName: form.name,
      verifyUrl: ensureAbsoluteUrl(`${BASE_URL}/support/verify/${token}`),
      departmentId: form.departmentId,
    })

  // ── Reuse an existing unconsumed verification for this submission ────────────
  // (e.g. the requester resubmitted before clicking the link) — re-send instead
  // of stacking duplicate pending rows and emails.
  if (idempotencyKey) {
    const pending = await prisma.pendingIntake.findFirst({
      where: {
        formConfigId: uuid,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        payload: { path: ["idempotencyKey"], equals: idempotencyKey },
      },
    })
    if (pending) {
      const res = await verify(pending.token)
      if (res.ok || res.skipped) {
        return NextResponse.json({ pending: true, email: submitterEmail })
      }
    }
  }

  // ── Store as pending + email a verification link (double opt-in) ─────────────
  const token = generateReplyToken()
  const pending = await prisma.pendingIntake.create({
    data: {
      formConfigId: uuid,
      token,
      email: submitterEmail,
      payload: payload as unknown as object,
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  })

  const res = await verify(token)

  // Email sending unavailable (no provider / dept disabled confirmations): we
  // can't verify, so fall back to creating the ticket directly.
  if (res.skipped) {
    await prisma.pendingIntake.delete({ where: { id: pending.id } }).catch(() => undefined)
    try {
      const { ticketId, humanId } = await createTicketFromPayload(uuid, payload)
      return NextResponse.json({ pending: false, ticketId, humanId }, { status: 201 })
    } catch (err) {
      console.error("[intake submit] direct creation failed:", err)
      return NextResponse.json({ error: "Failed to create submission" }, { status: 500 })
    }
  }

  // Provider rejected the address (bad recipient) — no ticket, tell the requester.
  if (!res.ok) {
    await prisma.pendingIntake.delete({ where: { id: pending.id } }).catch(() => undefined)
    return NextResponse.json(
      { error: "We couldn't send a confirmation to that email address — please double-check it." },
      { status: 400 },
    )
  }

  return NextResponse.json({ pending: true, email: submitterEmail })
}
