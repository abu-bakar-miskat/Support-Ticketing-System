import { getWorkCycleStart } from "@/lib/work-cycle"
import { syncResolutionTimerOnClosedAtChange, startMailboxResolutionOnWork } from "@/lib/sla-engine"
import { checkAndNotifyEstimateOverrun } from "@/lib/time-estimate-notify"
import { prisma } from "@/lib/db"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import type { StatusCategory } from "@/lib/status-category"
import { getTicketStatusCategory } from "@/lib/status-category.server"
import { latestPortalCommentSelect, portalCommentsAsConversation, portalIntakeSelect } from "@/lib/portal-conversation"

function durationSecsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

/**
 * Auto-start a timer for the actor when a ticket moves to "In Progress",
 * if they are the assignee or a co-assignee.
 * No-op for non-assignees, already-running timers on this ticket, or other statuses.
 */
export async function startTimerOnStatusChange(
  ticketId: string,
  newStatus: string,
  actor: { id: string; name: string; avatarUrl?: string | null },
  category?: StatusCategory,
): Promise<void> {
  if ((category ?? await getTicketStatusCategory(ticketId, newStatus)) !== "IN_PROGRESS") return

  await syncResolutionTimerOnClosedAtChange(ticketId, null)

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      assigneeId: true,
      closedAt: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      messages: {
        where: { status: "trusted" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { direction: true, createdAt: true },
      },
      comments: latestPortalCommentSelect,
      intake: portalIntakeSelect,
    },
  })
  if (!ticket || ticket.closedAt || ticket.deletedAt) return

  const isAssignee =
    ticket.assigneeId === actor.id ||
    ticket.assignees.some((a) => a.userId === actor.id)
  if (!isAssignee) return

  // The derived conversation label is Waiting for customer when the latest
  // public message is outbound. Automatic status changes must not restart work
  // while the agent is waiting; the next inbound customer reply will resume it.
  const cycleStart = await getWorkCycleStart(ticketId)
  const latest = [
    ...ticket.messages,
    ...portalCommentsAsConversation(ticket.comments, ticket.intake),
  ].filter((message) => !cycleStart || new Date(message.createdAt) >= cycleStart).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  if (latest?.direction === "outbound") return

  const latestInboundAt = latest ? new Date(latest.createdAt) : cycleStart ?? undefined
  const existingEntry = await prisma.timeEntry.findFirst({
    where: {
      ticketId,
      profileId: actor.id,
      OR: [
        { endedAt: null },
        ...(latestInboundAt ? [{ startedAt: { gte: latestInboundAt } }] : []),
      ],
    },
    select: { id: true },
  })
  // A running entry means there is nothing to start. An entry begun after the
  // latest inbound message means that reply already started one work session;
  // reconciliation must not restart it after the assignee manually pauses.
  if (existingEntry) return

  const now = new Date()
  const { entry, closed } = await prisma.$transaction(async (tx) => {
    // Close any open timer so only one entry is running — matches /api/time start
    const running = await tx.timeEntry.findMany({
      where: { profileId: actor.id, endedAt: null },
      select: { id: true, startedAt: true, ticketId: true },
    })
    const closedEntries: {
      id: string
      startedAt: Date
      endedAt: Date
      durationSecs: number
      ticketId: string | null
    }[] = []
    for (const open of running) {
      const durationSecs = durationSecsBetween(open.startedAt, now)
      await tx.timeEntry.update({
        where: { id: open.id },
        data: { endedAt: now, durationSecs },
      })
      closedEntries.push({
        id: open.id,
        startedAt: open.startedAt,
        endedAt: now,
        durationSecs,
        ticketId: open.ticketId,
      })
    }
    const created = await tx.timeEntry.create({
      data: {
        profileId: actor.id,
        ticketId,
        startedAt: now,
        billable: true,
      },
    })
    return { entry: created, closed: closedEntries }
  })

  await startMailboxResolutionOnWork(ticketId, now).catch(() => undefined)

  for (const previous of closed) {
    if (previous.ticketId) await checkAndNotifyEstimateOverrun(previous.ticketId)
  }

  await broadcastTimerChange(actor.id)
  await Promise.all([
    ...closed.map((c) => {
      if (!c.ticketId) return Promise.resolve()
      return broadcastTicketEvent(c.ticketId, "TIMER_STOPPED", actor.id, {
        userId: actor.id,
        userName: actor.name,
        entryId: c.id,
        durationSecs: c.durationSecs,
        endedAt: c.endedAt.toISOString(),
      }).catch(() => undefined)
    }),
    broadcastTicketEvent(ticketId, "TIMER_STARTED", actor.id, {
      userId: actor.id,
      userName: actor.name,
      avatarUrl: actor.avatarUrl ?? null,
      entryId: entry.id,
      startedAt: entry.startedAt.toISOString(),
    }).catch(() => undefined),
  ])
}
