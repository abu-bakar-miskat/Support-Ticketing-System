import { prisma } from "@/lib/db"
import { syncResolutionTimerOnClosedAtChange } from "@/lib/sla-engine"

type SubDepartmentStatusRow = { label: string; isComplete: boolean; order: number }

/**
 * Return the label of the first non-completion status from an already-ordered
 * (by `order` asc) list, or null when every status is a completion status.
 */
export function resolveReopenStatus(statuses: SubDepartmentStatusRow[]): string | null {
  return statuses.find((s) => !s.isComplete)?.label ?? null
}

/**
 * If the ticket is currently in a completion status, move it to the first
 * non-completion status and record a STATUS_CHANGED activity log entry that
 * attributes the reopen to a customer reply.
 *
 * Returns true when a reopen was performed, false otherwise (ticket was not
 * completed, or every team status is a completion status — edge case).
 */
export async function maybeReopenTicket(
  ticketId: string,
  subDepartmentId: string,
  actorId: string,
): Promise<boolean> {
  const [ticket, subDepartmentStatuses] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    }),
    prisma.subDepartmentStatus.findMany({
      where: { subDepartmentId },
      orderBy: { order: "asc" },
      select: { label: true, isComplete: true, order: true },
    }),
  ])

  if (!ticket) return false

  const currentStatus = subDepartmentStatuses.find((s) => s.label === ticket.status)
  if (!currentStatus?.isComplete) return false

  const targetLabel = resolveReopenStatus(subDepartmentStatuses)
  if (!targetLabel) {
    // All statuses are completion statuses — stay put
    return false
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: targetLabel, closedAt: null },
  })

  await syncResolutionTimerOnClosedAtChange(ticketId, null)

  await prisma.activityLog.create({
    data: {
      ticketId,
      actorId,
      action: "STATUS_CHANGED",
      metadata: {
        from: ticket.status,
        to: targetLabel,
        triggeredBy: "customer_reply",
      },
    },
  })

  return true
}
