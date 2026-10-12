import { stopMailboxFirstResponseOnActiveStatus } from "@/lib/sla-engine"
import { finalizeManualResolution } from "@/lib/manual-resolution"
import { checkAndNotifyEstimateOverrun } from "@/lib/time-estimate-notify"
import { prisma } from "@/lib/db"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import type { StatusCategory } from "@/lib/status-category"
import { getTicketStatusCategory } from "@/lib/status-category.server"

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
  category?: StatusCategory,
): Promise<void> {
  await stopMailboxFirstResponseOnActiveStatus(ticketId, newStatus).catch(() => undefined)
  if ((category ?? await getTicketStatusCategory(ticketId, newStatus)) === "IN_PROGRESS") return

  await finalizeManualResolution(ticketId)
  await stopRunningTimers(ticketId)
}

/**
 * A public agent reply changes the conversation to "Waiting for customer".
 * Stop work tracking even though the ticket itself remains In Progress.
 */
export async function stopRunningTimersForWaitingCustomer(
  ticketId: string,
): Promise<void> {
  await stopRunningTimers(ticketId)
}

async function stopRunningTimers(ticketId: string): Promise<void> {

  const running = await prisma.timeEntry.findMany({
    where: { ticketId, endedAt: null },
    select: {
      id: true,
      profileId: true,
      startedAt: true,
      profile: { select: { name: true } },
    },
  })
  if (running.length === 0) {
    await checkAndNotifyEstimateOverrun(ticketId)
    return
  }

  const now = new Date()
  await prisma.$transaction(
    running.map((entry) =>
      prisma.timeEntry.update({
        where: { id: entry.id },
        data: { endedAt: now, durationSecs: durationSecsBetween(entry.startedAt, now) },
      }),
    ),
  )

  await checkAndNotifyEstimateOverrun(ticketId)

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
