import { prisma } from "@/lib/db"
import { TicketPriority } from "@/generated/prisma/client"
import { sendIntakeConfirmationEmail, sendAssignmentEmail, sendIntakeManagerAlertEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import { prepareConversion, runConversion } from "@/lib/intake-conversion"
import { RESEND_RECEIVING_ENABLED } from "@/lib/email-config"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

export type ResponseEntry = { fieldId: string; label: string; type: string; value: string }

/** The validated support submission, stashed on PendingIntake so verification can replay ticket
 * creation without re-collecting or re-validating the requester's input. */
export type PendingPayload = {
  submitterName: string
  submitterEmail: string
  title: string
  priority: string | null
  issueId: string | null
  responses: ResponseEntry[]
  idempotencyKey: string | null
}

/** Creates the intake + ticket from an already-validated payload and fires the assignment / manager /
 * confirmation side effects. Used both by the verification click (via finalizePendingIntake) and by
 * the submit route's degraded path when email verification is unavailable. Throws on failure. */
export async function createTicketFromPayload(
  formConfigId: string,
  payload: PendingPayload,
): Promise<{ ticketId: string; humanId: string | null }> {
  const form = await prisma.intakeFormConfig.findUnique({ where: { id: formConfigId } })
  if (!form) throw new Error(`Form ${formConfigId} not found`)

  const { submitterName, submitterEmail, title, priority, issueId, responses, idempotencyKey } = payload

  // ── Resolve priority + estimatedHours (mirrors issue-based routing) ─────────
  let resolvedPriority: TicketPriority = TicketPriority.Medium
  let resolvedEstimatedHours: number | null = null
  let routedTeamId: string | null = null
  let issueAssigneeIds: string[] = []
  let issueRotaPointer = 0

  if (issueId) {
    const issue = await prisma.intakeIssue.findFirst({
      where: { id: issueId, formConfigId },
      include: { assignees: { select: { userId: true }, orderBy: { userId: "asc" } } },
    })
    if (issue) {
      resolvedPriority = issue.priority
      resolvedEstimatedHours = issue.estimatedHours
      routedTeamId = issue.intakeTeamId
      issueAssigneeIds = issue.assignees.map((a) => a.userId)
      issueRotaPointer = issue.assigneeRotaPointer
    }
  } else if (priority && VALID_PRIORITIES.has(priority)) {
    resolvedPriority = priority as TicketPriority
  }

  const storedResponses = idempotencyKey
    ? ([...responses, { _ikey: idempotencyKey }] as unknown[])
    : (responses as unknown[])

  const prep = await prepareConversion({
    formId: formConfigId,
    formName: form.name,
    intakeTeamId: routedTeamId ?? form.intakeTeamId,
    departmentId: form.departmentId,
    responses,
    priority: resolvedPriority,
    submitterName,
    title,
    autoAssign: form.autoAssign,
    issueId: issueId ?? null,
    issueAssigneeIds,
    issueRotaPointer,
  })

  const { ticketId, replyToken } = await prisma.$transaction(async (tx) =>
    runConversion(tx, prep, submitterName, submitterEmail, idempotencyKey, storedResponses, formConfigId, resolvedEstimatedHours),
  )

  // ── Fire-and-forget side effects ────────────────────────────────────────────
  if (prep.assigneeId) {
    createNotification({ recipientId: prep.assigneeId, type: "assignment", ticketId, message: prep.title }).catch(() => undefined)
  }

  const team = await prisma.team.findUnique({ where: { id: prep.intakeTeamId }, select: { prefix: true } })
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { ticketNumber: true } })
  const humanId = team && ticket ? `${team.prefix}-${ticket.ticketNumber}` : null

  if (prep.assigneeId && prep.assigneeEmail && humanId) {
    sendAssignmentEmail({
      to: prep.assigneeEmail,
      assigneeName: prep.assigneeName ?? "",
      assigneeId: prep.assigneeId,
      ticketId,
      humanId,
      ticketTitle: prep.title,
      assignedByName: "Support system",
      departmentId: form.departmentId,
    }).catch((err) => console.error("[intake] assignment email failed:", err))
  }

  for (const manager of prep.managers ?? []) {
    createNotification({ recipientId: manager.id, type: "intake_manager_alert", ticketId, message: prep.title }).catch(() => undefined)
    if (manager.email && humanId) {
      sendIntakeManagerAlertEmail({
        to: manager.email,
        managerId: manager.id,
        managerName: manager.name ?? "",
        ticketId,
        humanId,
        ticketTitle: prep.title,
        formName: form.name,
        submitterName,
        departmentId: form.departmentId,
      }).catch((err) => console.error("[intake] manager alert email failed:", err))
    }
  }

  const emailSummary = responses.filter((r) => r.value && r.value.trim()).map((r) => ({ label: r.label, value: r.value }))
  const useToken = RESEND_RECEIVING_ENABLED && form.allowCustomerReplies
  sendIntakeConfirmationEmail({
    to: submitterEmail,
    submitterName,
    submitterEmail,
    formName: form.name,
    title: title || undefined,
    priority: resolvedPriority || undefined,
    humanId: humanId ?? undefined,
    responses: emailSummary,
    replyToken: useToken ? replyToken : null,
    departmentId: form.departmentId,
  }).catch((err) => console.error("[intake] confirmation email failed:", err))

  return { ticketId, humanId }
}

export type FinalizeResult =
  | { status: "created" | "already"; humanId: string | null }
  | { status: "expired" | "notfound" | "error" }

/** Verifies a pending intake by its token and creates the ticket. The claim is atomic so a mail
 * scanner pre-fetching the link and the real click can't both create a ticket — only the caller
 * that flips consumedAt from null wins; everyone else gets the same already-created ticket. */
export async function finalizePendingIntake(token: string): Promise<FinalizeResult> {
  const pending = await prisma.pendingIntake.findUnique({ where: { token } })
  if (!pending) return { status: "notfound" }

  const humanIdFor = async (ticketId: string | null): Promise<string | null> => {
    if (!ticketId) return null
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { ticketNumber: true, team: { select: { prefix: true } } },
    })
    return ticket?.team ? `${ticket.team.prefix}-${ticket.ticketNumber}` : null
  }

  if (pending.consumedAt) return { status: "already", humanId: await humanIdFor(pending.ticketId) }
  if (pending.expiresAt.getTime() < Date.now()) return { status: "expired" }

  const claim = await prisma.pendingIntake.updateMany({
    where: { token, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  // Lost the race to a concurrent click/scanner — return the ticket they already created.
  if (claim.count === 0) {
    const fresh = await prisma.pendingIntake.findUnique({ where: { token } })
    return { status: "already", humanId: await humanIdFor(fresh?.ticketId ?? null) }
  }

  try {
    const { ticketId, humanId } = await createTicketFromPayload(
      pending.formConfigId,
      pending.payload as unknown as PendingPayload,
    )
    await prisma.pendingIntake.update({ where: { token }, data: { ticketId } })
    // Remember this address so future submissions skip the double opt-in link.
    await prisma.verifiedEmail
      .upsert({ where: { email: pending.email }, create: { email: pending.email }, update: {} })
      .catch(() => undefined)
    return { status: "created", humanId }
  } catch (err) {
    console.error("[intake verify] ticket creation failed:", err)
    // Release the claim so the requester can retry by clicking the link again.
    await prisma.pendingIntake.update({ where: { token }, data: { consumedAt: null } }).catch(() => undefined)
    return { status: "error" }
  }
}
