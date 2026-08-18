import { NextRequest, NextResponse, after } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ticketsInScope } from "@/lib/dept-scope"
import { sendResolutionEmail } from "@/lib/email"
import { canEditTicket } from "@/lib/ticket-date-permissions"
import { buildTicketEditContext } from "@/lib/cross-access"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { broadcastProjectBoardsChange } from "@/lib/project-boards-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { linkedLabelsForDepartment, labelsAfterStatusMove } from "@/lib/status-label-choice.server"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { status, chosenLabel } = body as { status?: string; chosenLabel?: string }

  if (!status?.trim()) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 })
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      subDepartmentId: true,
      ticketNumber: true,
      labels: true,
      deletedAt: true,
      closedAt: true,
      projectId: true,
      assigneeId: true,
      creatorId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { prefix: true, departmentId: true } },
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

  if (!ticket || ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const editCtx = await buildTicketEditContext(profile, ticket)
  if (!canEditTicket(profile, editCtx)) {
    return NextResponse.json(
      {
        error:
          "You can only move tickets you are assigned to, co-assigned to, or created",
      },
      { status: 403 },
    )
  }

  if (!(await ticketsInScope(profile, [id]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Validate the status exists for this team, and look up the status being left
  // (in the same query) so its linked labels can be dropped from the ticket.
  const [validStatus, priorStatus] = await Promise.all([
    prisma.subDepartmentStatus.findFirst({ where: { subDepartmentId: ticket.subDepartmentId, label: status } }),
    prisma.subDepartmentStatus.findFirst({ where: { subDepartmentId: ticket.subDepartmentId, label: ticket.status } }),
  ])
  if (!validStatus) {
    return NextResponse.json({ error: `"${status}" is not a valid status for this team` }, { status: 400 })
  }

  const fromStatus = ticket.status

  const departmentId = ticket.subDepartment.departmentId
  const [nextLinkedLabels, priorLinkedLabels] = await Promise.all([
    linkedLabelsForDepartment(validStatus.allowedLabels, departmentId),
    priorStatus
      ? linkedLabelsForDepartment(priorStatus.allowedLabels, departmentId)
      : Promise.resolve([]),
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
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
    const result = await tx.ticket.update({
      where: { id },
      data: { status, closedAt: validStatus.isComplete ? (ticket.closedAt ?? new Date()) : null },
      select: { id: true, status: true },
    })
    if (labelsChanged) {
      await tx.ticket.update({
        where: { id },
        data: { labels: nextLabels },
      })
    }
    return result
  })

  // Broadcast immediately so other viewers update before slow side-effects run
  if (fromStatus !== status) {
    void broadcastTicketEvent(id, "STATUS_CHANGED", profile.id, {
      from: fromStatus,
      to: status,
    })
  }
  if (labelsChanged) {
    const added = nextLabels.filter((label) => !ticket.labels.includes(label))
    const removed = ticket.labels.filter((label) => !nextLabels.includes(label))
    void broadcastTicketEvent(id, "LABELS_CHANGED", profile.id, {
      added,
      removed,
    })
  }

  // Heavy work after the response — keeps StatusSelect snappy
  after(async () => {
    await stopRunningTimersOnStatusChange(id, status).catch(() => undefined)
    await startTimerOnStatusChange(id, status, {
      id: profile.id,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    }).catch(() => undefined)

    if (ticket.projectId) {
      broadcastProjectBoardsChange(ticket.projectId).catch(() => undefined)
    }

    if (validStatus.isComplete) {
      cascadeCompleteToSubtickets(id).catch(() => undefined)
      const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`
      notifyTicketCompletion({
        ticketId: id,
        ticketTitle: ticket.title,
        humanId,
        subDepartmentId: ticket.subDepartmentId,
        creatorId: ticket.creatorId,
        actorId: profile.id,
        actorName: profile.name,
      }).catch(() => undefined)
    }

    if (validStatus.isComplete && ticket.intake) {
      sendResolutionEmail({
        to: ticket.intake.submitterEmail,
        submitterName: ticket.intake.submitterName,
        formName: ticket.intake.formConfig.name,
        ticketTitle: ticket.title,
        departmentId: ticket.subDepartment.departmentId,
      }).catch((err) => console.error("[resolution email] failed:", err))
    }
  })

  return NextResponse.json(updated)
}
