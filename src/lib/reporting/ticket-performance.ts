import type { PersonTicketPerformance, TicketSourceCounts } from "@/lib/api/reports"
import type { SlaIndicator } from "@/lib/sla-timer"

export type PerformanceTicket = {
  id: string
  assignee: { id: string; name: string } | null
  assignees: { user: { id: string; name: string } }[]
  intake: { apiKeyId: string | null; portalIdempotencyKey: string | null } | null
  activityLogs: { metadata: unknown }[]
  slaTimer: { source: string | null } | null
}

/** Creation origins are exclusive; customer replies do not change a ticket's origin. */
export function ticketSource(ticket: PerformanceTicket): keyof TicketSourceCounts {
  if (ticket.intake) {
    return ticket.intake.apiKeyId || ticket.intake.portalIdempotencyKey ? "portal" : "support"
  }
  if (ticket.slaTimer?.source === "mailbox" || ticket.activityLogs.some(({ metadata }) =>
    !!metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).source === "email",
  )) return "mailbox"
  return "manual"
}

export function slaOutcome(indicator: SlaIndicator | null, completed: boolean): "slaMet" | "slaMissed" | "slaPending" | "noSla" {
  if (!indicator) return "noSla"
  if (indicator.overall === "BREACHED") return "slaMissed"
  return completed ? "slaMet" : "slaPending"
}

/** Each distinct current assignee receives one contribution per ticket. */
export function summarizeTicketPerformance(
  tickets: readonly (PerformanceTicket & { completed: boolean; sla: SlaIndicator | null })[],
  members: readonly { id: string; name: string }[],
  personId = "all",
) {
  const ticketSources: TicketSourceCounts = { manual: 0, support: 0, portal: 0, mailbox: 0 }
  const rows = new Map<string | null, PersonTicketPerformance>()
  const ensure = (id: string | null, name: string) => {
    let row = rows.get(id)
    if (!row) {
      row = { personId: id, name, assigned: 0, completed: 0, slaMet: 0, slaMissed: 0, slaPending: 0, noSla: 0 }
      rows.set(id, row)
    }
    return row
  }
  for (const member of members) {
    if (personId === "all" || member.id === personId) ensure(member.id, member.name)
  }
  for (const ticket of tickets) {
    ticketSources[ticketSource(ticket)]++
    const people = new Map(ticket.assignees.map(({ user }) => [user.id, user.name]))
    if (ticket.assignee) people.set(ticket.assignee.id, ticket.assignee.name)
    if (!people.size && personId === "all") people.set("", "Unassigned")
    for (const [id, name] of people) {
      if (personId !== "all" && id !== personId) continue
      const row = ensure(id || null, name)
      row.assigned++
      if (ticket.completed) row.completed++
      row[slaOutcome(ticket.sla, ticket.completed)]++
    }
  }
  return {
    ticketSources,
    personPerformance: [...rows.values()].sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name)),
  }
}
