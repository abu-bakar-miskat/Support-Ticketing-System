import { prisma } from "@/lib/db"
import { statusCategory, type StatusCategory } from "@/lib/status-category"

/** Resolve the saved category for paths that only receive a ticket and label. */
export async function getTicketStatusCategory(ticketId: string, label: string): Promise<StatusCategory> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { subDepartmentId: true } })
  const status = ticket ? await prisma.subDepartmentStatus.findFirst({
    where: { subDepartmentId: ticket.subDepartmentId, label },
    select: { label: true, category: true },
  }) : null
  return statusCategory(status ?? { label })
}
