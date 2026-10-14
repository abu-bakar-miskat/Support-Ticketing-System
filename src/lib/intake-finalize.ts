import { prisma } from "@/lib/db"
import { TicketPriority } from "@/generated/prisma/client"
import { sendIntakeConfirmationEmail, sendAssignmentEmail, sendIntakeManagerAlertEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import { prepareConversion, runConversion } from "@/lib/intake-conversion"
import { startSlaTimers } from "@/lib/sla-engine"
import { applyRulesToTicket } from "@/lib/rule-executor"
import { recordAssignmentFailure } from "@/lib/assignment-engine"

import { snapshotAsJson, snapshotFormFields } from "@/lib/intake-form-schema"

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
  options: { apiKeyId?: string } = {},
): Promise<{ intakeId: string; ticketId: string; humanId: string | null }> {
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formConfigId },
    include: {
      fields: { orderBy: { order: "asc" } },
      department: { select: { tenantId: true } },
    },
  })
  if (!form) throw new Error(`Form ${formConfigId} not found`)

  const { submitterName, submitterEmail, title, priority, issueId, responses, idempotencyKey } = payload

  // ── Resolve priority + routing from the chosen SLA policy ────────────────────
  // A support form's selectable "issues" are its SLA policies; the picked policy
  // (issueId) supplies priority, optional concerned sub-department routing, and
  // — replacing the retired estimatedHours — its resolution target as the
  // ticket's estimated minutes. Assignment then uses that sub-department's
  // method among currently available members.
  let resolvedPriority: TicketPriority = TicketPriority.Medium
  let resolvedEstimatedMinutes: number | null = null
  let resolvedSlaPolicyId: string | null = null
  let routedSubDepartmentId: string | null = null
  let routedDepartmentId = form.departmentId

  if (issueId) {
    // The chosen issue may be authored on this form, or inherited from the
    // department's / tenant's department-wide SLA policies (see the tier fallback
    // in the form page + lib/sla-engine `resolveSlaPolicyTiers`). Accept any of
    // those, scoped to this form's department/tenant so a crafted issueId can't
    // pull in a policy from another department or tenant.
    const policy = await prisma.slaPolicy.findFirst({
      where: {
        id: issueId,
        enabled: true,
        tenantId: form.department.tenantId,
        OR: [
          { formConfigId },
          { departmentId: form.departmentId },
          { departmentId: null, tenantId: form.department.tenantId },
        ],
      },
      select: {
        id: true,
        priority: true,
        resolutionMins: true,
        subDepartmentId: true,
        departmentId: true,
      },
    })
    if (policy) {
      resolvedSlaPolicyId = policy.id
      resolvedPriority = policy.priority ?? TicketPriority.Medium
      resolvedEstimatedMinutes = policy.resolutionMins
      routedSubDepartmentId = policy.subDepartmentId
      routedDepartmentId = policy.departmentId ?? form.departmentId
    }
  } else if (priority && VALID_PRIORITIES.has(priority)) {
    resolvedPriority = priority as TicketPriority
  }

  const storedResponses = idempotencyKey
    ? ([...responses, { _ikey: idempotencyKey }] as unknown[])
    : (responses as unknown[])

  // Every ticket must land in a sub-department (it drives the human ID prefix).
  // Support forms are department-scoped, so routing precedence is:
  //   1. the chosen issue's SLA policy (SlaPolicy.subDepartmentId),
  //   2. the form's hidden fallback (legacy forms only — no longer set in the UI),
  //   3. the department's default (first-created) sub-department.
  // A department always has at least one sub-department, so a ticket always lands.
  let targetSubDepartmentId = routedSubDepartmentId ?? form.intakeSubDepartmentId
  if (!targetSubDepartmentId) {
    const defaultSub = await prisma.subDepartment.findFirst({
      where: { departmentId: routedDepartmentId },
      orderBy: { id: "asc" }, // cuids are time-ordered ⇒ first-created
      select: { id: true },
    })
    targetSubDepartmentId = defaultSub?.id ?? null
  }
  if (!targetSubDepartmentId) {
    throw new Error(
      `Form ${formConfigId} resolved no sub-department: department ${routedDepartmentId} has no sub-departments`,
    )
  }

  const prep = await prepareConversion({
    formId: formConfigId,
    formName: form.name,
    intakeSubDepartmentId: targetSubDepartmentId,
    departmentId: routedDepartmentId,
    responses,
    priority: resolvedPriority,
    submitterName,
    title,
    // issueRouted is true only when the selected issue (SLA policy) supplied the
    // concerned sub-department. In that case the assignment engine lets that
    // sub-department's method win over the form. When no issue drove routing
    // (fallback/default sub-department), the form's own method wins instead — so
    // a "Manual" form leaves the ticket unassigned as configured. The engine
    // still always runs and honors a resolved MANUAL as a deliberate
    // non-assignment (no form-level autoAssign gate).
    issueRouted: routedSubDepartmentId !== null,
  })

  const { intakeId, ticketId } = await prisma.$transaction(async (tx) =>
    runConversion(
      tx,
      prep,
      submitterName,
      submitterEmail,
      idempotencyKey,
      storedResponses,
      formConfigId,
      resolvedEstimatedMinutes,
      {
        schemaVersion: form.schemaVersion,
        fieldSnapshot: snapshotAsJson(snapshotFormFields(form.fields)),
      },
      options.apiKeyId,
    ),
  )

  // ── Fire-and-forget side effects ────────────────────────────────────────────
  if (prep.assigneeId) {
    createNotification({ recipientId: prep.assigneeId, type: "assignment", ticketId, message: prep.title }).catch(() => undefined)
  }

  const subDepartment = await prisma.subDepartment.findUnique({ where: { id: prep.intakeSubDepartmentId }, select: { prefix: true, tenantId: true } })
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { ticketNumber: true, createdAt: true } })
  const humanId = subDepartment && ticket ? `${subDepartment.prefix}-${ticket.ticketNumber}` : null

  if (subDepartment && ticket) {
    const formValues = Object.fromEntries(responses.map((r) => [r.fieldId, r.value]))
    // Public support-form tickets only have an SLA when the submitter selected
    // a valid SLA-backed issue. Without one, do not fall through to generic
    // department/tenant policy matching: that creates an invisible SLA timer
    // and can later auto-escalate a ticket that was submitted with no issue.
    if (resolvedSlaPolicyId) {
      await startSlaTimers(
        ticketId,
        subDepartment.tenantId,
        routedDepartmentId,
        { ...formValues, priority: resolvedPriority },
        ticket.createdAt,
        prep.intakeSubDepartmentId,
        resolvedSlaPolicyId,
        { assigneeId: prep.assigneeId },
      ).catch(() => undefined)
    }
    // RE-01/02: run the department's automation rules against the submitted form
    // values (plus resolved TicketPriority enum) and apply fired actions.
    await applyRulesToTicket(
      {
        id: ticketId,
        tenantId: subDepartment.tenantId,
        departmentId: routedDepartmentId,
        subDepartmentId: prep.intakeSubDepartmentId,
        assigneeId: prep.assigneeId ?? null,
        formConfigId,
        // An explicitly selected issue owns its targets; automation must not replace them.
        allowSla: !resolvedSlaPolicyId,
      },
      { ...formValues, priority: resolvedPriority },
    )
  }

  // ASG-02/03 (slice 11): no eligible agent was found — the ticket exists,
  // unassigned; report it immediately so it's never silently unrouted.
  if (prep.assignmentFailed && humanId) {
    recordAssignmentFailure(ticketId, routedDepartmentId, prep.creatorId, prep.title, humanId, prep.intakeSubDepartmentId).catch(() => undefined)
  }

  if (prep.assigneeId && prep.assigneeEmail && humanId) {
    sendAssignmentEmail({
      to: prep.assigneeEmail,
      assigneeName: prep.assigneeName ?? "",
      assigneeId: prep.assigneeId,
      ticketId,
      humanId,
      ticketTitle: prep.title,
      assignedByName: "Support system",
      departmentId: routedDepartmentId,
      subDepartmentId: prep.intakeSubDepartmentId,
    }).catch((err) => console.error("[intake] assignment email failed:", err))
  }

  for (const manager of prep.managers ?? []) {
    // `message` carries the ticket SOURCE (the support form's name) so the
    // notification UI can render "New Ticket raised from the {form name}".
    createNotification({ recipientId: manager.id, type: "intake_manager_alert", ticketId, message: form.name }).catch(() => undefined)
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
        departmentId: routedDepartmentId,
        subDepartmentId: prep.intakeSubDepartmentId,
      }).catch((err) => console.error("[intake] manager alert email failed:", err))
    }
  }

  const emailSummary = responses.filter((r) => r.value && r.value.trim()).map((r) => ({ label: r.label, value: r.value }))
  await sendIntakeConfirmationEmail({
    to: submitterEmail,
    submitterName,
    submitterEmail,
    formName: form.name,
    title: title || undefined,
    priority: resolvedPriority || undefined,
    humanId: humanId ?? undefined,
    responses: emailSummary,
    departmentId: routedDepartmentId,
    subDepartmentId: prep.intakeSubDepartmentId,
  }).catch((err) => {
    console.error("[intake] confirmation email failed:", err)
  })

  return { intakeId, ticketId, humanId }
}

export type FinalizeResult =
  | { status: "created" | "already"; humanId: string | null; departmentId: string | null }
  | { status: "expired" | "notfound" | "error"; departmentId: string | null }

/** Verifies a pending intake by its token and creates the ticket. The claim is atomic so a mail
 * scanner pre-fetching the link and the real click can't both create a ticket — only the caller
 * that flips consumedAt from null wins; everyone else gets the same already-created ticket. */
export async function finalizePendingIntake(token: string): Promise<FinalizeResult> {
  const pending = await prisma.pendingIntake.findUnique({ where: { token } })
  if (!pending) return { status: "notfound", departmentId: null }

  // DS-01: so the verification landing page can apply the right department's
  // branding — resolved once, up front, since every branch below needs it.
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: pending.formConfigId },
    select: { departmentId: true },
  })
  const departmentId = form?.departmentId ?? null

  const humanIdFor = async (ticketId: string | null): Promise<string | null> => {
    if (!ticketId) return null
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { ticketNumber: true, subDepartment: { select: { prefix: true } } },
    })
    return ticket?.subDepartment ? `${ticket.subDepartment.prefix}-${ticket.ticketNumber}` : null
  }

  if (pending.consumedAt) {
    return { status: "already", humanId: await humanIdFor(pending.ticketId), departmentId }
  }
  if (pending.expiresAt.getTime() < Date.now()) return { status: "expired", departmentId }

  const claim = await prisma.pendingIntake.updateMany({
    where: { token, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  // Lost the race to a concurrent click/scanner — return the ticket they already created.
  if (claim.count === 0) {
    const fresh = await prisma.pendingIntake.findUnique({ where: { token } })
    return { status: "already", humanId: await humanIdFor(fresh?.ticketId ?? null), departmentId }
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
    return { status: "created", humanId, departmentId }
  } catch (err) {
    console.error("[intake verify] ticket creation failed:", err)
    // Release the claim so the requester can retry by clicking the link again.
    await prisma.pendingIntake.update({ where: { token }, data: { consumedAt: null } }).catch(() => undefined)
    return { status: "error", departmentId }
  }
}
