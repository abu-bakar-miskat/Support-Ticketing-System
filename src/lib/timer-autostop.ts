import { prisma } from "@/lib/db"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { normalizeStatus } from "@/components/board/board-types"

function durationSecsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

/**
 * Stop and persist any running time entries for a ticket when it leaves the
 * "In Progress" status. Each affected user is notified via the timer broadcast
 * so their live timer state syncs immediately. No-op while still In Progress.
 */
export async function stopRunningTimersOnStatusChange(
  ticketId: string,
  newStatus: string,
): Promise<void> {
  if (normalizeStatus(newStatus) === "In Progress") return

  const running = await prisma.timeEntry.findMany({
    where: { ticketId, endedAt: null, kind: "DEVELOPMENT" },
    select: {
      id: true,
      profileId: true,
      startedAt: true,
      profile: { select: { name: true } },
    },
  })
  if (running.length === 0) return

  const now = new Date()
  await prisma.$transaction(
    running.map((entry) =>
      prisma.timeEntry.update({
        where: { id: entry.id },
        data: { endedAt: now, durationSecs: durationSecsBetween(entry.startedAt, now) },
      }),
    ),
  )

  const affected = [...new Set(running.map((e) => e.profileId))]
  await Promise.all([
    ...affected.map((profileId) => broadcastTimerChange(profileId)),
    ...running.map((entry) =>
      broadcastTicketEvent(ticketId, "TIMER_STOPPED", entry.profileId, {
        userId: entry.profileId,
        userName: entry.profile.name,
        entryId: entry.id,
        durationSecs: durationSecsBetween(entry.startedAt, now),
        endedAt: now.toISOString(),
      }).catch(() => undefined),
    ),
  ])
}
