import { prisma } from "@/lib/db"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { normalizeStatus } from "@/components/board/board-types"

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
): Promise<void> {
  if (normalizeStatus(newStatus) !== "In Progress") return

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      assigneeId: true,
      assignees: { select: { userId: true } },
    },
  })
  if (!ticket) return

  const isAssignee =
    ticket.assigneeId === actor.id ||
    ticket.assignees.some((a) => a.userId === actor.id)
  if (!isAssignee) return

  const alreadyRunningHere = await prisma.timeEntry.findFirst({
    where: {
      ticketId,
      profileId: actor.id,
      endedAt: null,
    },
    select: { id: true },
  })
  if (alreadyRunningHere) return

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
