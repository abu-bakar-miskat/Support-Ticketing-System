import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ticketsInScope } from "@/lib/dept-scope"
import { sendResolutionEmail } from "@/lib/email"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { canEditTicket } from "@/lib/ticket-date-permissions"
import { buildTicketEditContext } from "@/lib/cross-access"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { linkedLabelsForDepartment, labelsAfterStatusMove } from "@/lib/status-label-choice.server"

type Status = string

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      teamId: true,
      ticketNumber: true,
      labels: true,
      projectId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      closedAt: true,
      assignees: { select: { userId: true } },
      team: { select: { prefix: true, departmentId: true } },
      intake: {
        select: {
          id: true,
          submitterName: true,
          submitterEmail: true,
          formConfig: { select: { name: true } },
        },
      },
    },
  })

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  if (ticket.deletedAt !== null) {
    return NextResponse.json({ error: "Ticket has been deleted" }, { status: 409 })
  }

  const editCtx = await buildTicketEditContext(profile, ticket)
  if (!canEditTicket(profile, editCtx)) {
    return NextResponse.json(
      {
        error:
          "You can only change status on tickets you are assigned to, co-assigned to, or created",
      },
      { status: 403 },
    )
  }

  if (!(await ticketsInScope(profile, [id]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Resolve the next status dynamically from the team's configured order
  const teamStatuses = await prisma.teamStatus.findMany({
    where: { teamId: ticket.teamId },
    orderBy: { order: "asc" },
    select: { label: true, isComplete: true, allowedLabels: true },
  })

  const currentIdx = teamStatuses.findIndex((s) => s.label === ticket.status)
  const nextStatus = currentIdx !== -1 ? teamStatuses[currentIdx + 1] : undefined

  if (!nextStatus) {
    return NextResponse.json({ error: `Ticket is already at terminal status: ${ticket.status}` }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { to, chosenLabel } = body as { to?: string; chosenLabel?: string }

  if (to !== nextStatus.label) {
    return NextResponse.json(
      { error: `Invalid transition: ${ticket.status} → ${to}. Expected → ${nextStatus.label}` },
      { status: 400 },
    )
  }

  const isCompletion = nextStatus.isComplete
  const priorStatus = teamStatuses[currentIdx]

  const departmentId = ticket.team.departmentId
  const [nextLinkedLabels, priorLinkedLabels] = await Promise.all([
    linkedLabelsForDepartment(nextStatus.allowedLabels, departmentId),
    linkedLabelsForDepartment(priorStatus.allowedLabels, departmentId),
  ])

  const resolvedChosen =
    typeof chosenLabel === "string" && chosenLabel.trim() ? chosenLabel.trim() : undefined

  if (resolvedChosen && !nextLinkedLabels.includes(resolvedChosen)) {
    return NextResponse.json(
      { error: `Invalid linked label: ${resolvedChosen}` },
      { status: 400 },
    )
  }

  const nextLabels = labelsAfterStatusMove({
    ticketLabels: ticket.labels,
    priorLinkedLabels,
    nextLinkedLabels,
    chosenLabel: resolvedChosen,
  })
  const labelsChanged =
    nextLabels.length !== ticket.labels.length ||
    nextLabels.some((label) => !ticket.labels.includes(label)) ||
    ticket.labels.some((label) => !nextLabels.includes(label))

  const updated = await prisma.$transaction(async (tx) => {
    // Set session var so the trigger can stamp the correct actor on ActivityLog
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
    const { count } = await tx.ticket.updateMany({
      where: { id, status: ticket.status as Status },
      data: {
        status: to as Status,
        closedAt: isCompletion ? (ticket.closedAt ?? new Date()) : null,
      },
    })
    if (count === 0) return null
    if (labelsChanged) {
      await tx.ticket.update({
        where: { id },
        data: { labels: nextLabels },
      })
    }
    return tx.ticket.findUnique({
      where: { id },
      select: { id: true, status: true, cycleTime: true },
    })
  })

  if (!updated) {
    return NextResponse.json(
      { error: "Ticket changed while updating — refresh and try again" },
      { status: 409 },
    )
  }

  // Broadcast to ticket-activity channel so all viewers see the status change
  // in real-time. The DB trigger already wrote the ActivityLog row — this is
  // a broadcast-only call with no second write.
  broadcastTicketEvent(id, "STATUS_CHANGED", profile.id, {
    from: ticket.status,
    to: to as string,
  }).catch(() => undefined)

  if (labelsChanged) {
    const added = nextLabels.filter((label) => !ticket.labels.includes(label))
    const removed = ticket.labels.filter((label) => !nextLabels.includes(label))
    broadcastTicketEvent(id, "LABELS_CHANGED", profile.id, {
      added,
      removed,
    }).catch(() => undefined)
  }

  // Stop + persist any running timer if the ticket left "In Progress";
  // auto-start when moving into In Progress for the assignee who moved it.
  await stopRunningTimersOnStatusChange(id, to)
  await startTimerOnStatusChange(id, to, {
    id: profile.id,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  })

  if (isCompletion) {
    const humanId = `${ticket.team.prefix}-${ticket.ticketNumber}`
    notifyTicketCompletion({
      ticketId: id,
      ticketTitle: ticket.title,
      humanId,
      teamId: ticket.teamId,
      creatorId: ticket.creatorId,
      actorId: profile.id,
      actorName: profile.name,
    }).catch(() => undefined)

    cascadeCompleteToSubtickets(id).catch(() => undefined)
  }

  // Fire-and-forget resolution email
  if (isCompletion && ticket.intake) {
    sendResolutionEmail({
      to: ticket.intake.submitterEmail,
      submitterName: ticket.intake.submitterName,
      formName: ticket.intake.formConfig.name,
      ticketTitle: ticket.title,
      departmentId: ticket.team.departmentId,
    }).catch((err) => console.error("[resolution email] failed:", err))
  }

  return NextResponse.json(updated)
}
