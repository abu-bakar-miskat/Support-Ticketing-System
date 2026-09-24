import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"

/**
 * Alerts the assignee + department managers the first time a ticket's total
 * logged time (sum of TimeEntry.durationSecs) crosses its `estimatedTime`.
 *
 * Fires at most once per ticket: guarded by `Ticket.estimateOverrunNotifiedAt`,
 * which is stamped via a conditional updateMany so concurrent timer stops can't
 * double-send. No-ops when the ticket has no estimate. Best-effort — callers
 * invoke it fire-and-forget so it never blocks the timer API response.
 */
export async function checkAndNotifyEstimateOverrun(ticketId: string): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        estimatedTime: true,
        estimateOverrunNotifiedAt: true,
        deletedAt: true,
        assigneeId: true,
        subDepartment: { select: { departmentId: true } },
      },
    })

    // Nothing to compare against, already alerted, or ticket is gone.
    if (!ticket || ticket.deletedAt !== null) return
    if (!ticket.estimatedTime || ticket.estimatedTime <= 0) return
    if (ticket.estimateOverrunNotifiedAt !== null) return

    // Sum completed laps only — a running entry has no durationSecs yet, and the
    // stop that triggered this call has already been finalized.
    const agg = await prisma.timeEntry.aggregate({
      where: { ticketId, endedAt: { not: null } },
      _sum: { durationSecs: true },
    })
    const trackedSecs = agg._sum.durationSecs ?? 0
    if (trackedSecs < ticket.estimatedTime * 60) return

    // Stamp the guard atomically; only the winner of the race sends.
    const stamped = await prisma.ticket.updateMany({
      where: { id: ticketId, estimateOverrunNotifiedAt: null },
      data: { estimateOverrunNotifiedAt: new Date() },
    })
    if (stamped.count === 0) return

    const recipientIds = new Set<string>()
    if (ticket.assigneeId) recipientIds.add(ticket.assigneeId)
    const managers = await prisma.departmentManager.findMany({
      where: { departmentId: ticket.subDepartment.departmentId },
      select: { userId: true },
    })
    for (const m of managers) recipientIds.add(m.userId)

    for (const recipientId of recipientIds) {
      createNotification({
        recipientId,
        type: "time_estimate_exceeded",
        ticketId,
        message: "has exceeded its time estimate",
      }).catch(() => undefined)
    }
  } catch {
    // best-effort — never break the timer flow
  }
}
