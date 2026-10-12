/**
 * Ticket escalation — shared core (moved out of the /escalate route so the
 * SLA engine can reuse it in a system context). Moves the ticket to the
 * sub-department's "Escalated" status, reconciles status-linked labels, keeps
 * the timers/SLA in sync, and lets the DB `log_ticket_status_change` trigger
 * write the STATUS_CHANGED ActivityLog row.
 *
 * The route passes the acting user's id; automation (e.g. an SLA breach) omits
 * it and instead stamps `activitySource` so the trigger records a FK-safe
 * actor (the ticket creator) while the UI renders it as an automation event
 * rather than crediting a human — same pattern as lib/github/advance-status.ts.
 */
import { prisma } from "@/lib/db"
import { statusCategory, type StatusCategory } from "@/lib/status-category"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { linkedLabelsForDepartment, labelsAfterStatusMove } from "@/lib/status-label-choice.server"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { syncResolutionTimerOnClosedAtChange } from "@/lib/sla-engine"
import { clearAgentUnavailableLabel } from "@/lib/agent-unavailable"

export const ESCALATED_LABEL = "Escalated"

export function isEscalatedLabel(label: string): boolean {
  return /escalat/i.test(label)
}

/**
 * De-escalation on active-work entry: when a ticket moves into "In Progress"
 * (an agent has picked it up), drop the "Escalated" label so it no longer reads
 * as needing attention. Pure — returns `labels` unchanged for any other target
 * status. "In Progress" can never itself be an escalated status, so no extra
 * guard is needed. Shared by every route that changes a ticket's status
 * (`/status`, `/move`, generic `PATCH`).
 */
export function labelsAfterDeEscalation(labels: string[], toStatus: string, category?: StatusCategory): string[] {
  if (statusCategory({ label: toStatus, category }) !== "IN_PROGRESS") return labels
  return labels.filter((label) => !isEscalatedLabel(label))
}

export interface EscalateTicketOptions {
  /** Acting user id (drives ActivityLog actor). Falls back to the ticket creator. */
  actorId?: string | null
  /**
   * Automation source merged into the STATUS_CHANGED ActivityLog metadata (via
   * the `app.activity_source` GUC). Set by non-human callers, e.g. an SLA breach.
   */
  activitySource?: Record<string, unknown> | null
  /** Actor for the auto-start-timer side effect; skipped in system context. */
  timerActor?: { id: string; name: string; avatarUrl?: string | null } | null
}

export type EscalateTicketResult =
  | { status: "not_found" }
  | { status: "already_escalated" | "escalated"; id: string; ticketStatus: string; labels: string[] }

/**
 * Escalate a ticket. Returns `not_found` when the ticket is missing/deleted,
 * `already_escalated` when it is already at the escalated status+label (no-op),
 * or `escalated` with the updated status/labels. Never throws for the caller's
 * side effects (broadcast/timer sync are best-effort).
 */
export async function escalateTicket(
  ticketId: string,
  opts: EscalateTicketOptions = {},
): Promise<EscalateTicketResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      status: true,
      labels: true,
      subDepartmentId: true,
      deletedAt: true,
      closedAt: true,
      creatorId: true,
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket || ticket.deletedAt) {
    return { status: "not_found" }
  }

  const statuses = await prisma.subDepartmentStatus.findMany({
    where: { subDepartmentId: ticket.subDepartmentId },
    orderBy: { order: "asc" },
  })
  const escalatedStatus = statuses.find((s) => isEscalatedLabel(s.label))
  const nextStatus = escalatedStatus?.label ?? ticket.status
  const alreadyEscalated =
    isEscalatedLabel(ticket.status) && ticket.labels.some((l) => l.toLowerCase() === ESCALATED_LABEL.toLowerCase())
  if (alreadyEscalated) {
    return { status: "already_escalated", id: ticket.id, ticketStatus: ticket.status, labels: ticket.labels }
  }

  const priorStatus = statuses.find((s) => s.label === ticket.status)
  const departmentId = ticket.subDepartment.departmentId
  const [nextLinkedLabels, priorLinkedLabels] = await Promise.all([
    escalatedStatus
      ? linkedLabelsForDepartment(escalatedStatus.allowedLabels, departmentId)
      : Promise.resolve([] as string[]),
    priorStatus
      ? linkedLabelsForDepartment(priorStatus.allowedLabels, departmentId)
      : Promise.resolve([] as string[]),
  ])

  let nextLabels = labelsAfterStatusMove({
    ticketLabels: ticket.labels,
    priorLinkedLabels,
    nextLinkedLabels,
    chosenLabel: undefined,
  })
  if (!nextLabels.some((l) => l.toLowerCase() === ESCALATED_LABEL.toLowerCase())) {
    nextLabels = [...nextLabels, ESCALATED_LABEL]
  }
  // A closed ticket isn't waiting on anyone (the availability sweep only
  // revisits open tickets, so the flag would otherwise stick forever).
  if (escalatedStatus?.category === "COMPLETE") nextLabels = clearAgentUnavailableLabel(nextLabels)

  // FK-safe actor for the ActivityLog trigger; the creator satisfies the NOT
  // NULL actor when no human is driving the change (automation).
  const actorId = opts.actorId ?? ticket.creatorId
  const activitySource = opts.activitySource ? JSON.stringify(opts.activitySource) : null

  const newClosedAt = escalatedStatus?.category === "COMPLETE" ? (ticket.closedAt ?? new Date()) : null
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actorId}, true)`
    if (activitySource) {
      await tx.$executeRaw`SELECT set_config('app.activity_source', ${activitySource}, true)`
    }
    return tx.ticket.update({
      where: { id: ticketId },
      data: { status: nextStatus, labels: nextLabels, closedAt: newClosedAt },
      select: { id: true, status: true, labels: true },
    })
  })

  if (ticket.status !== nextStatus) {
    void broadcastTicketEvent(ticketId, "STATUS_CHANGED", actorId, {
      from: ticket.status,
      to: nextStatus,
    })
  }
  void broadcastTicketEvent(ticketId, "LABELS_CHANGED", actorId, {
    added: nextLabels.filter((l) => !ticket.labels.includes(l)),
    removed: ticket.labels.filter((l) => !nextLabels.includes(l)),
  })

  if (ticket.closedAt !== newClosedAt) {
    await syncResolutionTimerOnClosedAtChange(ticketId, newClosedAt).catch(() => undefined)
  }
  await stopRunningTimersOnStatusChange(ticketId, nextStatus).catch(() => undefined)
  if (opts.timerActor) {
    await startTimerOnStatusChange(ticketId, nextStatus, opts.timerActor).catch(() => undefined)
  }

  return { status: "escalated", id: updated.id, ticketStatus: updated.status, labels: updated.labels }
}
