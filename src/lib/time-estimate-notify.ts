import { checkAndNotifyLegacyEstimateOverrun } from "@/lib/legacy-time-estimate-notify"
import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { getManualResolutionTicket, trackedWorkSeconds } from "@/lib/manual-resolution"

/** Record a manual resolution breach once, including work still running. */
export async function checkAndNotifyEstimateOverrun(
  ticketId: string,
  now: Date = new Date(),
  finalizing = false,
): Promise<void> {
  try {
    const ticket = await getManualResolutionTicket(ticketId)
    if (!ticket) {
      if (!finalizing) await checkAndNotifyLegacyEstimateOverrun(ticketId)
      return
    }
    if (ticket.closedAt && !finalizing) return
    if (!ticket.estimatedTime || ticket.estimatedTime <= 0) return
    if (ticket.estimateOverrunNotifiedAt !== null) return

    const trackedSecs = await trackedWorkSeconds(ticketId, ticket.closedAt ?? now)
    // Exactly the estimate is still compliant; breach requires excess work.
    if (trackedSecs <= ticket.estimatedTime * 60) return

    const stamped = await prisma.$transaction(async (tx) => {
      const claim = await tx.ticket.updateMany({
        where: {
          id: ticketId, estimateOverrunNotifiedAt: null,
          estimatedTime: ticket.estimatedTime, closedAt: ticket.closedAt,
        },
        data: { estimateOverrunNotifiedAt: now },
      })
      if (claim.count === 0) return false
      await tx.slaBreach.create({
        data: {
          ticketId, tenantId: ticket.tenantId,
          // SlaBreach.timerId is an opaque string, not a foreign key. Manual
          // work has no two-clock SlaTimer and no first-response SLA.
          timerId: `manual:${ticketId}`, metric: "resolution",
          targetMins: ticket.estimatedTime!, breachedAt: now,
        },
      })
      return true
    })
    if (!stamped) return

    const recipientIds = new Set<string>()
    if (ticket.assigneeId) recipientIds.add(ticket.assigneeId)
    const managers = await prisma.departmentManager.findMany({
      where: { departmentId: ticket.subDepartment.departmentId },
      select: { userId: true },
    })
    for (const m of managers) recipientIds.add(m.userId)
    const tenantManagers = await prisma.tenantMembership.findMany({
      where: { tenantId: ticket.tenantId, role: "manager", isActive: true },
      select: { userId: true },
    })
    for (const manager of tenantManagers) recipientIds.add(manager.userId)
    await Promise.all([...recipientIds].map((recipientId) => createNotification({
      recipientId, type: "time_estimate_exceeded", ticketId,
      message: "has breached its resolution estimate",
    })))
  } catch (error) {
    console.error("[manual-resolution] breach check failed", error)
  }
}
