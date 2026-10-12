import { prisma } from "@/lib/db"
import { applyReopenedLabel, REOPENED_LABEL } from "@/lib/ticket-column-moves"

type SubDepartmentStatusRow = { label: string; isComplete: boolean; order: number }

/**
 * Return the label of the first non-completion status from an already-ordered
 * (by `order` asc) list, or null when every status is a completion status.
 */
export function resolveReopenStatus(statuses: SubDepartmentStatusRow[]): string | null {
  return statuses.find((s) => !s.isComplete)?.label ?? null
}

/**
 * Mark a completed ticket needing agent attention without changing its status.
 *
 * Returns false: customer replies never reopen automatically.
 */
export async function maybeReopenTicket(
  ticketId: string,
  subDepartmentId: string,
  _actorId: string,
): Promise<boolean> {
  void _actorId // Kept for compatibility with inbound callers.
  const [ticket, subDepartmentStatuses] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, labels: true },
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

  // A reply labels the closed ticket for attention. Only the agent's later
  // In Progress transition reopens it and resets SLA/work allowances.
  const labels = ticket.labels ?? []
  if (!labels.includes(REOPENED_LABEL)) await prisma.ticket.update({
    where: { id: ticketId }, data: { labels: applyReopenedLabel(labels) },
  })
  return false
}
