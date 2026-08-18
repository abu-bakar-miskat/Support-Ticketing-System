import { prisma } from "@/lib/db"
import type { TicketRef } from "./parse-refs"

/**
 * Resolves parsed ticket refs to ticket IDs. Prefix must match a Team.prefix
 * exactly; the ticket is looked up by (teamId, ticketNumber). Soft-deleted
 * tickets and unknown refs are silently dropped.
 */
export async function resolveTicketIds(refs: TicketRef[]): Promise<string[]> {
  if (refs.length === 0) return []

  const prefixes = [...new Set(refs.map((r) => r.prefix))]
  const subDepartments = await prisma.subDepartment.findMany({
    where: { prefix: { in: prefixes } },
    select: { id: true, prefix: true },
  })
  const subDepartmentByPrefix = new Map(subDepartments.map((t) => [t.prefix, t.id]))

  const lookups = refs.flatMap((r) => {
    const subDepartmentId = subDepartmentByPrefix.get(r.prefix)
    return subDepartmentId ? [{ subDepartmentId, ticketNumber: r.number }] : []
  })
  if (lookups.length === 0) return []

  const tickets = await prisma.ticket.findMany({
    where: { OR: lookups, deletedAt: null },
    select: { id: true },
  })
  return tickets.map((t) => t.id)
}
