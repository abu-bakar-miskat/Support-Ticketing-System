import type { PerformanceTicket } from "./ticket-performance"
import type { PerformanceTicketDetail, SlaOutcomeCounts, UserPerformance } from "@/lib/api/reports"
import type { SlaIndicator } from "@/lib/sla-timer"
import { mean } from "./stats"

export const PERFORMANCE_METHOD = "Ranking: 50% SLA compliance, 30% completed volume relative to the busiest person, 20% speed relative to SLA allowances. Only people with completed tickets and measured SLA results are ranked. Small samples are less reliable."
export type UserPerformanceSample = PerformanceTicket & {
  title: string; ticketNumber: number; priority: string; subDepartment: { prefix: string }
  createdAt: Date; closedAt: Date | null; completed: boolean; sla: SlaIndicator | null
  responseStoppedAt: Date | null; replyAt: Date | null
}
const inRange = (date: Date | null, start: Date, end: Date) => !!date && date >= start && date < end
const emptyCounts = (): SlaOutcomeCounts => ({ met: 0, breached: 0, pending: 0, noPolicy: 0 })
const outcomeLabels: Record<keyof SlaOutcomeCounts, string> = { met: "Met", breached: "Breached", pending: "Pending", noPolicy: "No policy" }
function outcome(metric: SlaIndicator["resolution"] | undefined, finished: boolean): keyof SlaOutcomeCounts {
  if (!metric) return "noPolicy"
  return metric.status === "BREACHED" ? "breached" : finished ? "met" : "pending"
}
export function formatPerformanceDuration(seconds: number | null): string {
  if (seconds === null) return "—"
  const total = Math.round(seconds)
  const days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), mins = Math.floor(total % 3600 / 60), secs = total % 60
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", mins ? `${mins}m` : "", `${secs}s`].filter(Boolean).join(" ")
}

/** Completion/reply cohorts use their event timestamps, regardless of creation date. */
export function summarizeUserPerformance(samples: UserPerformanceSample[], members: { id: string; name: string }[], start: Date, end: Date, personId = "all") {
  const rows = new Map<string | null, UserPerformance>()
  const times = new Map<string | null, { reply: number[]; completion: number[]; resolution: number[]; ratios: number[] }>()
  const ensure = (id: string | null, name: string) => {
    if (!rows.has(id)) {
      rows.set(id, { personId: id, name, assigned: 0, completed: 0, priorities: {}, responseSla: emptyCounts(), resolutionSla: emptyCounts(), avgReplySecs: null, avgCompletionSecs: null, avgSlaResolutionSecs: null, replySamples: 0, completionSamples: 0, slaResolutionSamples: 0, score: null, rank: null })
      times.set(id, { reply: [], completion: [], resolution: [], ratios: [] })
    }
    return rows.get(id)!
  }
  members.forEach((member) => ensure(member.id, member.name))
  const details: PerformanceTicketDetail[] = []
  for (const ticket of samples) {
    const completed = ticket.completed && inRange(ticket.closedAt, start, end)
    const replied = inRange(ticket.replyAt, start, end)
    const responseFinished = inRange(ticket.responseStoppedAt, start, end)
    // Include pending/breached results for the tickets created in the period,
    // and terminal outcomes for completions/replies in the period.
    const created = inRange(ticket.createdAt, start, end)
    if (!created && !completed && !replied && !responseFinished) continue
    const responseIncluded = responseFinished || replied || (created && !ticket.responseStoppedAt)
    const resolutionIncluded = completed || (created && !ticket.completed)
    const response = outcome(ticket.sla?.firstResponse, !!ticket.responseStoppedAt)
    const resolution = outcome(ticket.sla?.resolution, ticket.completed)
    const replySecs = ticket.replyAt ? Math.max(0, ticket.replyAt.getTime() - ticket.createdAt.getTime()) / 1000 : null
    const completionSecs = ticket.completed && ticket.closedAt ? Math.max(0, ticket.closedAt.getTime() - ticket.createdAt.getTime()) / 1000 : null
    const people = new Map<string | null, string>(ticket.assignees.map(({ user }) => [user.id, user.name]))
    if (ticket.assignee) people.set(ticket.assignee.id, ticket.assignee.name)
    if (!people.size) people.set(null, "Unassigned")
    for (const [id, name] of people) {
      const row = ensure(id, name), values = times.get(id)!
      if (created) row.assigned++
      if (completed) { row.completed++; row.priorities[ticket.priority] = (row.priorities[ticket.priority] ?? 0) + 1 }
      if (responseIncluded) row.responseSla[response]++
      if (resolutionIncluded) row.resolutionSla[resolution]++
      if (replied && replySecs !== null) values.reply.push(replySecs)
      if (completed && completionSecs !== null) values.completion.push(completionSecs)
      if (completed && ticket.sla) {
        values.resolution.push(ticket.sla.resolution.elapsedMs / 1000)
        for (const metric of [ticket.sla.firstResponse, ticket.sla.resolution]) {
          if (metric.targetMs > 0) values.ratios.push(Math.min(1, Math.max(0, metric.elapsedMs / metric.targetMs)))
        }
      }
    }
    if (personId === "all" || people.has(personId)) details.push({
      id: ticket.id, ticket: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`, title: ticket.title,
      people: [...people.values()].join(", "), priority: ticket.priority,
      completedAt: completed ? ticket.closedAt!.toISOString() : null, repliedAt: replied ? ticket.replyAt!.toISOString() : null,
      responseSla: responseIncluded ? outcomeLabels[response] : "Outside period", resolutionSla: resolutionIncluded ? outcomeLabels[resolution] : "Outside period",
      replySecs: replied ? replySecs : null, completionSecs: completed ? completionSecs : null,
      slaResolutionSecs: completed && ticket.sla ? ticket.sla.resolution.elapsedMs / 1000 : null,
    })
  }
  const maxCompleted = Math.max(1, ...[...rows.values()].filter((r) => r.personId).map((r) => r.completed))
  for (const row of rows.values()) {
    const values = times.get(row.personId)!
    row.avgReplySecs = mean(values.reply); row.avgCompletionSecs = mean(values.completion); row.avgSlaResolutionSecs = mean(values.resolution)
    row.replySamples = values.reply.length; row.completionSamples = values.completion.length
    row.slaResolutionSamples = values.resolution.length
    const met = row.responseSla.met + row.resolutionSla.met
    const judged = met + row.responseSla.breached + row.resolutionSla.breached
    if (row.personId && row.completed && judged && values.ratios.length) {
      row.score = Math.round(1000 * (0.5 * met / judged + 0.3 * row.completed / maxCompleted + 0.2 * (1 - mean(values.ratios)!))) / 10
    }
  }
  const ranked = [...rows.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.completed - a.completed || a.name.localeCompare(b.name))
  let rank = 0
  ranked.forEach((row, index) => {
    if (row.score !== null) { if (!index || row.score !== ranked[index - 1].score) rank = index + 1; row.rank = rank }
  })
  return { userPerformance: ranked.filter((r) => personId === "all" || r.personId === personId), performanceDetails: details }
}
