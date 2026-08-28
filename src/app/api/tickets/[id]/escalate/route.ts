import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ticketsInScope } from "@/lib/dept-scope"
import { canEditTicket } from "@/lib/ticket-date-permissions"
import { buildTicketEditContext } from "@/lib/cross-access"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { linkedLabelsForDepartment, labelsAfterStatusMove } from "@/lib/status-label-choice.server"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { syncResolutionTimerOnClosedAtChange } from "@/lib/sla-engine"

export const ESCALATED_LABEL = "Escalated"

function isEscalatedLabel(label: string): boolean {
  return /escalat/i.test(label)
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      labels: true,
      subDepartmentId: true,
      deletedAt: true,
      closedAt: true,
      assigneeId: true,
      creatorId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const editCtx = await buildTicketEditContext(profile, ticket)
  if (!canEditTicket(profile, editCtx)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!(await ticketsInScope(profile, [id]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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
    return NextResponse.json({ id: ticket.id, status: ticket.status, labels: ticket.labels })
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

  const newClosedAt = escalatedStatus?.isComplete ? (ticket.closedAt ?? new Date()) : null
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
    return tx.ticket.update({
      where: { id },
      data: { status: nextStatus, labels: nextLabels, closedAt: newClosedAt },
      select: { id: true, status: true, labels: true },
    })
  })

  if (ticket.status !== nextStatus) {
    void broadcastTicketEvent(id, "STATUS_CHANGED", profile.id, {
      from: ticket.status,
      to: nextStatus,
    })
  }
  void broadcastTicketEvent(id, "LABELS_CHANGED", profile.id, {
    added: nextLabels.filter((l) => !ticket.labels.includes(l)),
    removed: ticket.labels.filter((l) => !nextLabels.includes(l)),
  })

  if (ticket.closedAt !== newClosedAt) {
    await syncResolutionTimerOnClosedAtChange(id, newClosedAt).catch(() => undefined)
  }
  await stopRunningTimersOnStatusChange(id, nextStatus).catch(() => undefined)
  await startTimerOnStatusChange(id, nextStatus, {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  }).catch(() => undefined)

  return NextResponse.json(updated)
}
