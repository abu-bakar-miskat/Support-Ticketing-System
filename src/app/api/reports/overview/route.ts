import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getProfileDeptScope, ticketInDeptWhere, effectiveTicketDept } from "@/lib/dept-scope"
import { resolveReportRange } from "@/lib/report-period"
import { normalizeStatus, UI_STATUS_DOT } from "@/components/board/board-types"
import type {
  ReportsOverview,
  NamedCount,
  ModuleSpeed,
  CommentLoad,
  DistSlice,
  ProjectTickets,
  ModuleTickets,
  CrossDeptContribution,
} from "@/lib/api/reports"

const BUG_LABEL = "Bug"

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500",
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#ec4899",
  Low: "#94a3b8",
}
const PRIORITY_ORDER = ["Urgent", "Critical", "High", "Medium", "Low"]

export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") ?? "all"
  // Per-person filtering is manager/admin-only; ignore the param for others.
  const canFilterByPerson = profile.role === "admin" || profile.role === "manager"
  const personId = canFilterByPerson ? (searchParams.get("personId") ?? "all") : "all"
  const { start, end } = resolveReportRange(
    searchParams.get("from"),
    searchParams.get("to"),
  )

  const deptScope = await getProfileDeptScope(profile)
  // No dept scope (admin global) still bounds to the active tenant.
  const teamFilter = deptScope
    ? { teamId: { in: deptScope.teamIds } }
    : { tenantId: profile.activeTenantId ?? "__no_tenant__" }
  const projectFilter = projectId && projectId !== "all" ? { projectId } : {}
  // Person filter = tickets assigned to that person; every widget follows it.
  const personFilter = personId && personId !== "all" ? { assigneeId: personId } : {}
  const base = { deletedAt: null, ...teamFilter, ...projectFilter, ...personFilter }
  // Cohort created within the selected period (for creation-based metrics).
  const createdWhere = { ...base, createdAt: { gte: start, lt: end } }
  // Tickets resolved (closed) within the selected period.
  const closedWhere = { ...base, closedAt: { gte: start, lt: end } }
  // QA is a separate axis (join table), so its widgets scope by team/project only,
  // independent of the dev-assignee person filter.
  const qaBase = { deletedAt: null, ...teamFilter, ...projectFilter }
  const qaClosedTicketWhere = { ...qaBase, closedAt: { gte: start, lt: end } }
  const qaOpenTicketWhere = { ...qaBase, createdAt: { gte: start, lt: end }, closedAt: null }

  const [
    createdGroups,
    resolvedGroups,
    bugGroups,
    moduleTickets,
    statusGroups,
    priorityGroups,
    workloadGroups,
    projectTotalGroups,
    projectOpenGroups,
    moduleTotalGroups,
    moduleOpenGroups,
    scopeProjectGroups,
    qaResolvedGroups,
    qaWorkloadGroups,
    completeStatuses,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["creatorId"],
      where: createdWhere,
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["assigneeId", "teamId", "status"],
      where: createdWhere,
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["moduleId"],
      where: {
        ...closedWhere,
        labels: { has: BUG_LABEL },
        cycleTime: { not: null },
        moduleId: { not: null },
      },
      _avg: { cycleTime: true },
    }),
    prisma.ticket.findMany({
      where: { ...createdWhere, moduleId: { not: null } },
      select: {
        ticketNumber: true,
        moduleId: true,
        team: { select: { prefix: true } },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
    }),
    prisma.ticket.groupBy({ by: ["teamId", "status"], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...createdWhere, closedAt: null },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({ by: ["projectId"], where: createdWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: { ...createdWhere, closedAt: null },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["moduleId"],
      where: { ...createdWhere, moduleId: { not: null } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["moduleId"],
      where: { ...createdWhere, moduleId: { not: null }, closedAt: null },
      _count: { _all: true },
    }),
    // Full project list in scope (ignores period + project filter) for the picker.
    prisma.ticket.groupBy({
      by: ["projectId"],
      where: { deletedAt: null, ...teamFilter },
      _count: { _all: true },
    }),
    // QA resolved: closed tickets grouped by QA assignee (via join table).
    prisma.ticketQaAssignee.groupBy({
      by: ["userId"],
      where: { ticket: qaClosedTicketWhere },
      _count: { _all: true },
    }),
    // QA workload: open tickets grouped by QA assignee.
    prisma.ticketQaAssignee.groupBy({
      by: ["userId"],
      where: { ticket: qaOpenTicketWhere },
      _count: { _all: true },
    }),
    // Statuses flagged complete per team — the source of truth for "done".
    prisma.teamStatus.findMany({
      where: {
        isComplete: true,
        ...(deptScope
          ? { teamId: { in: deptScope.teamIds } }
          : { team: { tenantId: profile.activeTenantId ?? "__no_tenant__" } }),
      },
      select: { teamId: true, label: true },
    }),
  ])

  // A ticket is "done" when its current status is flagged isComplete on its team.
  // Teams with no configured statuses fall back to the default "Live" complete state.
  const completeByTeam = new Map<string, Set<string>>()
  for (const s of completeStatuses) {
    const set = completeByTeam.get(s.teamId) ?? new Set<string>()
    set.add(s.label)
    completeByTeam.set(s.teamId, set)
  }
  const isDone = (teamId: string, status: string): boolean => {
    const set = completeByTeam.get(teamId)
    if (set && set.size > 0) return set.has(status)
    return normalizeStatus(status) === "Live"
  }

  // Full member list in scope (ignores all filters) for the person picker.
  // Members never receive the list — the picker is manager/admin-only.
  const memberOptions = canFilterByPerson
    ? await prisma.profile.findMany({
        where: {
          deletedAt: null,
          ...(deptScope
            ? { memberships: { some: { teamId: { in: deptScope.teamIds }, isActive: true } } }
            : { tenantMemberships: { some: { tenantId: profile.activeTenantId ?? "__no_tenant__", isActive: true } } }),
        },
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { name: "asc" },
      })
    : []

  // ── Resolve display names for creators / resolvers ──
  const personIds = [
    ...new Set(
      [
        ...createdGroups.map((g) => g.creatorId),
        ...resolvedGroups.map((g) => g.assigneeId),
        ...workloadGroups.map((g) => g.assigneeId),
        ...qaResolvedGroups.map((g) => g.userId),
        ...qaWorkloadGroups.map((g) => g.userId),
      ].filter((id): id is string => !!id),
    ),
  ]
  const people = personIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(people.map((p) => [p.id, p.name]))

  const created: NamedCount[] = createdGroups
    .filter((g) => g.creatorId)
    .map((g) => ({ name: nameById.get(g.creatorId) ?? "Unknown", count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const resolvedByPerson = new Map<string, number>()
  for (const g of resolvedGroups) {
    if (!g.assigneeId || !isDone(g.teamId, g.status)) continue
    resolvedByPerson.set(g.assigneeId, (resolvedByPerson.get(g.assigneeId) ?? 0) + g._count._all)
  }
  const resolved: NamedCount[] = [...resolvedByPerson.entries()]
    .map(([id, count]) => ({ name: nameById.get(id) ?? "Unknown", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── Resolve module names ──
  const moduleIds = [
    ...new Set(
      [
        ...bugGroups.map((g) => g.moduleId),
        ...moduleTickets.map((t) => t.moduleId),
        ...moduleTotalGroups.map((g) => g.moduleId),
      ].filter((id): id is string => !!id),
    ),
  ]
  const modules = moduleIds.length
    ? await prisma.projectModule.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true, name: true },
      })
    : []
  const moduleName = new Map(modules.map((m) => [m.id, m.name]))

  const bugResolution: ModuleSpeed[] = bugGroups
    .filter((g) => g.moduleId && g._avg.cycleTime != null)
    .map((g) => ({
      module: moduleName.get(g.moduleId!) ?? "Module",
      days: Math.max(1, Math.round((g._avg.cycleTime as number) / 86_400)),
    }))
    .sort((a, b) => b.days - a.days)

  // ── Comment load by module: least/most commented ticket per module ──
  const byModule = new Map<string, { humanId: string; count: number }[]>()
  for (const t of moduleTickets) {
    if (!t.moduleId) continue
    const arr = byModule.get(t.moduleId) ?? []
    arr.push({ humanId: `${t.team.prefix}-${t.ticketNumber}`, count: t._count.comments })
    byModule.set(t.moduleId, arr)
  }
  const commentLoad: CommentLoad[] = [...byModule.entries()]
    .map(([mid, arr]) => {
      const sorted = [...arr].sort((a, b) => a.count - b.count)
      return {
        module: moduleName.get(mid) ?? "Module",
        least: sorted[0] ?? null,
        most: sorted[sorted.length - 1] ?? null,
      }
    })
    .sort((a, b) => a.module.localeCompare(b.module))

  // ── Status distribution (open statuses normalized; all done statuses → "Completed") ──
  const statusCountMap = new Map<string, number>()
  for (const g of statusGroups) {
    const label = isDone(g.teamId, g.status) ? "Completed" : normalizeStatus(g.status)
    statusCountMap.set(label, (statusCountMap.get(label) ?? 0) + g._count._all)
  }
  const STATUS_ORDER = ["To Do", "In Progress", "Pull Request", "Live", "Blocked", "Completed"]
  const statusDist: DistSlice[] = [...statusCountMap.entries()]
    .map(([label, count]) => ({
      label,
      count,
      color:
        label === "Completed"
          ? "#16a34a"
          : UI_STATUS_DOT[label as keyof typeof UI_STATUS_DOT] ?? "#94a3b8",
    }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.label) - STATUS_ORDER.indexOf(b.label))

  // ── Priority distribution ──
  const priorityDist: DistSlice[] = priorityGroups
    .map((g) => ({
      label: g.priority,
      count: g._count._all,
      color: PRIORITY_COLOR[g.priority] ?? "#94a3b8",
    }))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.label) - PRIORITY_ORDER.indexOf(b.label))

  // ── Open workload per assignee ──
  const workload: NamedCount[] = workloadGroups
    .filter((g) => g.assigneeId)
    .map((g) => ({ name: nameById.get(g.assigneeId!) ?? "Unknown", count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── QA tasks per person (resolved / open), counted separately from dev work ──
  const qaResolved: NamedCount[] = qaResolvedGroups
    .map((g) => ({ name: nameById.get(g.userId) ?? "Unknown", count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const qaWorkload: NamedCount[] = qaWorkloadGroups
    .map((g) => ({ name: nameById.get(g.userId) ?? "Unknown", count: g._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── Project ticket overview (open / total) ──
  const projectIds = [
    ...new Set(
      [
        ...projectTotalGroups.map((g) => g.projectId),
        ...scopeProjectGroups.map((g) => g.projectId),
      ].filter((id): id is string => !!id),
    ),
  ]
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, color: true },
      })
    : []
  const projectMeta = new Map(projects.map((p) => [p.id, p]))
  const projectOptions = scopeProjectGroups
    .map((g) => g.projectId)
    .filter((id): id is string => !!id)
    .map((id) => ({ id, name: projectMeta.get(id)?.name ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const openByProject = new Map(
    projectOpenGroups.map((g) => [g.projectId, g._count._all]),
  )
  const projectTickets: ProjectTickets[] = projectTotalGroups
    .filter((g) => g.projectId)
    .map((g) => ({
      project: projectMeta.get(g.projectId!)?.name ?? "Unknown",
      color: projectMeta.get(g.projectId!)?.color ?? "#94a3b8",
      open: openByProject.get(g.projectId) ?? 0,
      total: g._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // ── Ticket count by module (open / total) ──
  const openByModule = new Map(
    moduleOpenGroups.map((g) => [g.moduleId, g._count._all]),
  )
  const moduleTicketOverview: ModuleTickets[] = moduleTotalGroups
    .filter((g) => g.moduleId)
    .map((g) => ({
      module: moduleName.get(g.moduleId!) ?? "Module",
      open: openByModule.get(g.moduleId) ?? 0,
      total: g._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const totalTickets = statusGroups.reduce((s, g) => s + g._count._all, 0)
  const closedTickets = statusGroups.reduce(
    (s, g) => s + (isDone(g.teamId, g.status) ? g._count._all : 0),
    0,
  )
  const totals = {
    open: totalTickets - closedTickets,
    closed: closedTickets,
    total: totalTickets,
  }

  // ── Cross-department contributions ──
  // What this department's people did for OTHER departments in the period:
  // tickets created, tickets completed, and time logged on teams outside the scope.
  // Only meaningful when a department is in scope — a global admin view has no
  // "other department" to compare against.
  let crossDept: CrossDeptContribution[] = []
  if (deptScope) {
    const deptTeamIds = deptScope.teamIds
    const deptMembers = await prisma.profile.findMany({
      where: {
        deletedAt: null,
        memberships: { some: { teamId: { in: deptTeamIds }, isActive: true } },
      },
      select: { id: true, name: true, avatarUrl: true },
    })
    const crossMemberIds = deptMembers.map((m) => m.id)

    if (crossMemberIds.length > 0) {
      // "Other department" = tickets NOT belonging to the active department, by
      // the ticket's project department (not its team) — so work done on a
      // member's own team but inside another department's project counts.
      const notInDept = { NOT: ticketInDeptWhere(deptScope.activeDeptId) }
      const deptSelect = {
        project: {
          select: {
            departmentId: true,
            department: { select: { id: true, name: true } },
            team: { select: { department: { select: { id: true, name: true } } } },
          },
        },
        team: { select: { department: { select: { id: true, name: true } } } },
      } as const
      const [crossCreated, crossCompleted, crossTime] = await Promise.all([
        prisma.ticket.findMany({
          where: {
            deletedAt: null,
            ...notInDept,
            creatorId: { in: crossMemberIds },
            createdAt: { gte: start, lt: end },
          },
          select: { creatorId: true, ...deptSelect },
        }),
        prisma.ticket.findMany({
          where: {
            deletedAt: null,
            ...notInDept,
            assigneeId: { in: crossMemberIds },
            closedAt: { gte: start, lt: end },
          },
          select: { assigneeId: true, ...deptSelect },
        }),
        prisma.timeEntry.findMany({
          where: {
            profileId: { in: crossMemberIds },
            startedAt: { gte: start, lt: end },
            ticket: notInDept,
          },
          select: {
            profileId: true,
            durationSecs: true,
            ticket: { select: deptSelect },
          },
        }),
      ])

      type Agg = {
        created: number
        completed: number
        loggedSecs: number
        byDept: Map<string, { name: string; created: number; completed: number; loggedSecs: number }>
      }
      const byPerson = new Map<string, Agg>()
      const ensure = (personId: string): Agg => {
        let a = byPerson.get(personId)
        if (!a) {
          a = { created: 0, completed: 0, loggedSecs: 0, byDept: new Map() }
          byPerson.set(personId, a)
        }
        return a
      }
      const ensureDept = (a: Agg, dept: { id: string; name: string } | null) => {
        const id = dept?.id ?? "__unknown__"
        let d = a.byDept.get(id)
        if (!d) {
          d = { name: dept?.name ?? "Unknown department", created: 0, completed: 0, loggedSecs: 0 }
          a.byDept.set(id, d)
        }
        return d
      }

      for (const t of crossCreated) {
        if (!t.creatorId) continue
        const a = ensure(t.creatorId)
        a.created++
        ensureDept(a, effectiveTicketDept(t)).created++
      }
      for (const t of crossCompleted) {
        if (!t.assigneeId) continue
        const a = ensure(t.assigneeId)
        a.completed++
        ensureDept(a, effectiveTicketDept(t)).completed++
      }
      for (const e of crossTime) {
        const a = ensure(e.profileId)
        const secs = e.durationSecs ?? 0
        a.loggedSecs += secs
        ensureDept(a, e.ticket ? effectiveTicketDept(e.ticket) : null).loggedSecs += secs
      }

      const memberById = new Map(deptMembers.map((m) => [m.id, m]))
      crossDept = [...byPerson.entries()]
        .map(([personId, a]) => ({
          personId,
          name: memberById.get(personId)?.name ?? "Unknown",
          avatarUrl: memberById.get(personId)?.avatarUrl ?? null,
          created: a.created,
          completed: a.completed,
          loggedSecs: a.loggedSecs,
          byDepartment: [...a.byDept.values()]
            .sort((x, y) => y.created + y.completed - (x.created + x.completed))
            .map((d) => ({
              departmentName: d.name,
              created: d.created,
              completed: d.completed,
              loggedSecs: d.loggedSecs,
            })),
        }))
        .sort(
          (x, y) =>
            y.created + y.completed - (x.created + x.completed) ||
            y.loggedSecs - x.loggedSecs,
        )
        .slice(0, 12)
    }
  }

  const response: ReportsOverview = {
    created,
    resolved,
    bugResolution,
    commentLoad,
    statusDist,
    priorityDist,
    workload,
    qaResolved,
    qaWorkload,
    projectTickets,
    moduleTickets: moduleTicketOverview,
    totals,
    projectOptions,
    memberOptions: memberOptions.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null })),
    crossDept,
  }
  return NextResponse.json(response)
}
