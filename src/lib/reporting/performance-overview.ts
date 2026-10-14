import "server-only"
import { prisma } from "@/lib/db"
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine"
import type { SlaIndicatorView } from "@/lib/sla-timer"
import { statusCategory } from "@/lib/status-category"
import { summarizeTicketPerformance } from "./ticket-performance"
import { summarizeUserPerformance, type UserPerformanceSample } from "./user-performance"
import { reportScopeWhere, type ReportScope } from "./report-scope"
import type { PerformanceTicketDetail, ReportsOverview, UserPerformance } from "@/lib/api/reports"

const PERFORMANCE_TICKET_SELECT = {
  id: true, title: true, ticketNumber: true, priority: true, createdAt: true,
  status: true, subDepartmentId: true, closedAt: true,
  subDepartment: { select: { prefix: true } },
  assignee: { select: { id: true, name: true } },
  assignees: { select: { user: { select: { id: true, name: true } } } },
  intake: { select: { apiKeyId: true, portalIdempotencyKey: true } },
  slaTimer: { select: { source: true, firstResponseStoppedAt: true } },
  messages: {
    where: { direction: "outbound", status: "trusted", authorProfileId: { not: null } },
    orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true },
  },
  comments: {
    where: { portalVisible: true, deletedAt: null, messageId: null },
    orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true },
  },
  activityLogs: {
    where: { action: "TICKET_CREATED", metadata: { path: ["source"], equals: "email" } },
    select: { metadata: true },
    take: 1,
  },
} as const

/** Tickets touched in [start, end): created, closed, first response stopped, or replied to. */
const performancePeriodWhere = (start: Date, end: Date) => ({
  OR: [
    { createdAt: { gte: start, lt: end } },
    { closedAt: { gte: start, lt: end } },
    { slaTimer: { is: { firstResponseStoppedAt: { gte: start, lt: end } } } },
    { messages: { some: { direction: "outbound" as const, status: "trusted" as const, createdAt: { gte: start, lt: end } } } },
    { comments: { some: { portalVisible: true, deletedAt: null, createdAt: { gte: start, lt: end } } } },
  ],
})

type PerformanceTicketRow = Awaited<ReturnType<typeof prisma.ticket.findMany<{ select: typeof PERFORMANCE_TICKET_SELECT }>>>[number]

/** Evaluate SLA via the authoritative engine with persistence disabled: reports
 * must never reconcile live records or trigger manager notifications. */
async function evaluatePerformanceTickets(tickets: PerformanceTicketRow[], isDone: (subDepartmentId: string, label: string) => boolean) {
  const now = new Date()
  const evaluated: (PerformanceTicketRow & { completed: boolean; sla: SlaIndicatorView | null })[] = []
  for (let offset = 0; offset < tickets.length; offset += 6) {
    evaluated.push(...await Promise.all(tickets.slice(offset, offset + 6).map(async (ticket) => {
      const completed = isDone(ticket.subDepartmentId, ticket.status)
      const sla = ticket.slaTimer
        ? await getSlaIndicatorViewForTicket(ticket.id, completed ? ticket.closedAt ?? now : now, { readOnly: true, includeDetails: true })
        : null
      return { ...ticket, completed, sla }
    })))
  }
  return evaluated
}

function toUserPerformanceSamples(tickets: Awaited<ReturnType<typeof evaluatePerformanceTickets>>): UserPerformanceSample[] {
  return tickets.map((ticket) => ({
    ...ticket,
    responseStoppedAt: ticket.sla?.details?.firstResponseStoppedAt ? new Date(ticket.sla.details.firstResponseStoppedAt) : ticket.slaTimer?.firstResponseStoppedAt ?? null,
    // Actual customer communication is distinct from the policy's response
    // boundary (which can also stop when staff enter an active status).
    replyAt: [ticket.messages[0]?.createdAt, ticket.comments.find((comment) => !comment.body.startsWith("[Portal — "))?.createdAt]
      .filter((date): date is Date => !!date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  }))
}

export type PerformanceOverview = Pick<ReportsOverview, "ticketSources" | "personPerformance" | "userPerformance" | "performanceDetails" | "totals" | "memberOptions">

/** Shared read-only calculations for the live report, previews, and scheduled exports. */
export async function loadPerformanceOverview(scope: ReportScope, start: Date, end: Date, personId = "all", projectId = "all"): Promise<PerformanceOverview> {
  const scopeWhere = reportScopeWhere(scope)
  const projectFilter = projectId !== "all" ? { projectId } : {}
  const subIds = scope.kind === "department" ? scope.subDepartmentIds : null
  const tenantId = scope.kind === "none" ? "__none__" : scope.tenantId
  const [performanceTickets, statuses, memberOptions] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        deletedAt: null, isDraft: false, ...scopeWhere, ...projectFilter, ...performancePeriodWhere(start, end),
      },
      select: PERFORMANCE_TICKET_SELECT,
    }),
    prisma.subDepartmentStatus.findMany({
      where: subIds ? { subDepartmentId: { in: subIds } } : { subDepartment: { tenantId } },
      select: { subDepartmentId: true, label: true, category: true },
    }),
    prisma.profile.findMany({
      where: {
        deletedAt: null,
        ...(subIds ? { memberships: { some: { subDepartmentId: { in: subIds }, isActive: true } } }
          : { tenantMemberships: { some: { tenantId, isActive: true } } }),
      },
      select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" },
    }),
  ])
  const categories = new Map(statuses.map((s) => [`${s.subDepartmentId}::${s.label}`, statusCategory(s)]))
  const isDone = (subDepartmentId: string, label: string) => (categories.get(`${subDepartmentId}::${label}`) ?? statusCategory({ label })) === "COMPLETE"
  const evaluatedTickets = await evaluatePerformanceTickets(performanceTickets, isDone)
  const createdSamples = evaluatedTickets.filter((ticket) => ticket.createdAt >= start && ticket.createdAt < end &&
    (personId === "all" || ticket.assignee?.id === personId || ticket.assignees.some(({ user }) => user.id === personId)))
  const { ticketSources, personPerformance } = summarizeTicketPerformance(createdSamples, memberOptions, personId)
  const { userPerformance, performanceDetails } = summarizeUserPerformance(toUserPerformanceSamples(evaluatedTickets), memberOptions, start, end, personId)

  const closed = createdSamples.filter((ticket) => ticket.completed).length
  return { ticketSources, personPerformance, userPerformance, performanceDetails, memberOptions,
    totals: { total: createdSamples.length, closed, open: createdSamples.length - closed } }
}

/**
 * One person's SLA/reply/completion performance across every tenant ticket
 * they are (co-)assigned to — the profile page's view of the same numbers the
 * report's people table shows. Caller is responsible for authorising the view.
 */
export async function loadPersonPerformance(personId: string, personName: string, start: Date, end: Date, projectId?: string): Promise<{ summary: UserPerformance; details: PerformanceTicketDetail[] }> {
  const tickets = await prisma.ticket.findMany({
    where: {
      deletedAt: null, isDraft: false, ...(projectId ? { projectId } : {}),
      AND: [
        { OR: [{ assigneeId: personId }, { assignees: { some: { userId: personId } } }] },
        performancePeriodWhere(start, end),
      ],
    },
    select: PERFORMANCE_TICKET_SELECT,
  })
  const subIds = [...new Set(tickets.map((t) => t.subDepartmentId))]
  const statuses = subIds.length
    ? await prisma.subDepartmentStatus.findMany({ where: { subDepartmentId: { in: subIds } }, select: { subDepartmentId: true, label: true, category: true } })
    : []
  const categories = new Map(statuses.map((s) => [`${s.subDepartmentId}::${s.label}`, statusCategory(s)]))
  const isDone = (subDepartmentId: string, label: string) => (categories.get(`${subDepartmentId}::${label}`) ?? statusCategory({ label })) === "COMPLETE"
  const evaluated = await evaluatePerformanceTickets(tickets, isDone)
  const { userPerformance, performanceDetails } = summarizeUserPerformance(toUserPerformanceSamples(evaluated), [{ id: personId, name: personName }], start, end, personId)
  return { summary: userPerformance[0], details: performanceDetails }
}
