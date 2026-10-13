import "server-only"
import { prisma } from "@/lib/db"
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine"
import type { SlaIndicatorView } from "@/lib/sla-timer"
import { statusCategory } from "@/lib/status-category"
import { summarizeTicketPerformance } from "./ticket-performance"
import { summarizeUserPerformance } from "./user-performance"
import { reportScopeWhere, type ReportScope } from "./report-scope"
import type { ReportsOverview } from "@/lib/api/reports"

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
        deletedAt: null, isDraft: false, ...scopeWhere, ...projectFilter,
        OR: [
          { createdAt: { gte: start, lt: end } },
          { closedAt: { gte: start, lt: end } },
          { slaTimer: { is: { firstResponseStoppedAt: { gte: start, lt: end } } } },
          { messages: { some: { direction: "outbound", status: "trusted", createdAt: { gte: start, lt: end } } } },
          { comments: { some: { portalVisible: true, deletedAt: null, createdAt: { gte: start, lt: end } } } },
        ],
      },
      select: {
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
      },
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
  // Use the authoritative SLA engine with persistence disabled: reports must
  // never reconcile live records or trigger manager notifications.
  const now = new Date()
  const evaluatedTickets: (typeof performanceTickets[number] & { completed: boolean; sla: SlaIndicatorView | null })[] = []
  for (let offset = 0; offset < performanceTickets.length; offset += 6) {
    evaluatedTickets.push(...await Promise.all(performanceTickets.slice(offset, offset + 6).map(async (ticket) => {
      const completed = isDone(ticket.subDepartmentId, ticket.status)
      const sla = ticket.slaTimer
        ? await getSlaIndicatorViewForTicket(ticket.id, completed ? ticket.closedAt ?? now : now, { readOnly: true, includeDetails: true })
        : null
      return { ...ticket, completed, sla }
    })))
  }
  const createdSamples = evaluatedTickets.filter((ticket) => ticket.createdAt >= start && ticket.createdAt < end &&
    (personId === "all" || ticket.assignee?.id === personId || ticket.assignees.some(({ user }) => user.id === personId)))
  const { ticketSources, personPerformance } = summarizeTicketPerformance(createdSamples, memberOptions, personId)
  const { userPerformance, performanceDetails } = summarizeUserPerformance(evaluatedTickets.map((ticket) => ({
    ...ticket,
    responseStoppedAt: ticket.sla?.details?.firstResponseStoppedAt ? new Date(ticket.sla.details.firstResponseStoppedAt) : ticket.slaTimer?.firstResponseStoppedAt ?? null,
    // Actual customer communication is distinct from the policy's response
    // boundary (which can also stop when staff enter an active status).
    replyAt: [ticket.messages[0]?.createdAt, ticket.comments.find((comment) => !comment.body.startsWith("[Portal — "))?.createdAt]
      .filter((date): date is Date => !!date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  })), memberOptions, start, end, personId)

  const closed = createdSamples.filter((ticket) => ticket.completed).length
  return { ticketSources, personPerformance, userPerformance, performanceDetails, memberOptions,
    totals: { total: createdSamples.length, closed, open: createdSamples.length - closed } }
}
