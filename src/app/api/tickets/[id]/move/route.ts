import { NextRequest, NextResponse, after } from "next/server"
import { requireAuth, assertTicketEditAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendResolutionEmail, sendStatusChangedEmail } from "@/lib/email"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { broadcastProjectBoardsChange } from "@/lib/project-boards-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { linkedLabelsForDepartment, labelsAfterStatusMove } from "@/lib/status-label-choice.server"
import { labelsAfterDeEscalation } from "@/lib/ticket-escalation"
import { syncResolutionTimerOnClosedAtChange } from "@/lib/sla-engine"
import { resolutionUpdateOnStatusChange } from "@/lib/resolution-tracking"
import { runWithScope, uniqueTicketReadScope } from "@/lib/request-scope"
import { clearAgentUnavailableLabel } from "@/lib/agent-unavailable"

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
      isDraft: true,
      tenantId: true,
      closedAt: true,
      projectId: true,
      assigneeId: true,
      creatorId: true,
      // Resolution-timer inputs: saved In Progress start + allowed target.
      inProgressStartedAt: true,
      estimatedTime: true,
      slaTimer: { select: { resolutionTargetMins: true } },
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

  const accessError = await assertTicketEditAccess(profile, ticket)
  if (accessError) return accessError

  // Validate the status exists for this subDepartment, and look up the status being left
  // (in the same query) so its linked labels can be dropped from the ticket.
  const [validStatus, priorStatus] = await Promise.all([
    prisma.subDepartmentStatus.findFirst({ where: { subDepartmentId: ticket.subDepartmentId, label: status } }),
    prisma.subDepartmentStatus.findFirst({ where: { subDepartmentId: ticket.subDepartmentId, label: ticket.status } }),
  ])
  if (!validStatus) {
    return NextResponse.json({ error: `"${status}" is not a valid status for this subDepartment` }, { status: 400 })
  }

  const isCompletion = validStatus.category === "COMPLETE"
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

  const movedLabels = labelsAfterDeEscalation(
    labelsAfterStatusMove({
      ticketLabels: ticket.labels,
      priorLinkedLabels,
      nextLinkedLabels,
      chosenLabel: resolvedChosen,
    }),
    status,
    validStatus.category,
  )
  // A closed ticket isn't waiting on anyone — and the availability sweep only
  // revisits open tickets, so the flag would otherwise stick forever.
  const nextLabels = isCompletion ? clearAgentUnavailableLabel(movedLabels) : movedLabels
  const labelsChanged =
    nextLabels.length !== ticket.labels.length ||
    nextLabels.some((label) => !ticket.labels.includes(label)) ||
    ticket.labels.some((label) => !nextLabels.includes(label))

  const newClosedAt = isCompletion ? (ticket.closedAt ?? new Date()) : null

  // Start the resolution timer on entry to "In Progress"; stop it + record the
  // total time and within/exceeded verdict on completion (shared helper).
  const resolutionData = resolutionUpdateOnStatusChange({
    toStatus: status,
    category: validStatus.category,
    isCompletion: isCompletion,
    newClosedAt,
    currentInProgressStartedAt: ticket.inProgressStartedAt,
    slaResolutionTargetMins: ticket.slaTimer?.resolutionTargetMins,
    estimatedTime: ticket.estimatedTime,
  })

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
    const result = await tx.ticket.update({
      where: { id },
      data: { status, closedAt: newClosedAt, ...resolutionData },
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
  // `after()` runs outside the request's async context. Keep this ticket's
  // narrow authorization scope so the timer helper can read the ticket and
  // create the assignee's time entry after a move to In Progress.
  after(() => runWithScope(uniqueTicketReadScope(profile, id), async () => {
    if (ticket.closedAt !== newClosedAt) {
      await syncResolutionTimerOnClosedAtChange(id, newClosedAt).catch(() => undefined)
    }
    await stopRunningTimersOnStatusChange(id, status, validStatus.category).catch(() => undefined)
    await startTimerOnStatusChange(id, status, {
      id: profile.id,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    }, validStatus.category).catch(() => undefined)

    if (ticket.projectId) {
      broadcastProjectBoardsChange(ticket.projectId).catch(() => undefined)
    }

    if (isCompletion) {
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

    if (isCompletion && ticket.intake) {
      sendResolutionEmail({
        to: ticket.intake.submitterEmail,
        submitterName: ticket.intake.submitterName,
        formName: ticket.intake.formConfig.name,
        ticketTitle: ticket.title,
        departmentId: ticket.subDepartment.departmentId,
        subDepartmentId: ticket.subDepartmentId,
      }).catch((err) => console.error("[resolution email] failed:", err))
    } else if (!isCompletion && ticket.intake && fromStatus !== status) {
      sendStatusChangedEmail({
        to: ticket.intake.submitterEmail,
        submitterName: ticket.intake.submitterName,
        formName: ticket.intake.formConfig.name,
        ticketTitle: ticket.title,
        previousStatus: fromStatus,
        newStatus: status,
        departmentId: ticket.subDepartment.departmentId,
        subDepartmentId: ticket.subDepartmentId,
      }).catch((err) => console.error("[status-changed email] failed:", err))
    }
  }))

  return NextResponse.json(updated)
}
