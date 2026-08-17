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
  const teams = await prisma.team.findMany({
    where: { prefix: { in: prefixes } },
    select: { id: true, prefix: true },
  })
  const teamByPrefix = new Map(teams.map((t) => [t.prefix, t.id]))

  const lookups = refs.flatMap((r) => {
    const teamId = teamByPrefix.get(r.prefix)
    return teamId ? [{ teamId, ticketNumber: r.number }] : []
  })
  if (lookups.length === 0) return []

  const tickets = await prisma.ticket.findMany({
    where: { OR: lookups, deletedAt: null },
    select: { id: true },
  })
  return tickets.map((t) => t.id)
}
