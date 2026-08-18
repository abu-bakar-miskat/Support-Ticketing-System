import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { avatarColorFor } from "@/lib/avatar"
import { entrySeconds, formatHm, relativeAgo } from "@/lib/time-data"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { resolveReportRange } from "@/lib/report-period"
import type { StatCard, TeamMember, TeamTimeResponse, ProjectTimeRow } from "@/lib/api/reports"

const WEEK_TARGET_SECS = 40 * 3600
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  qa: "QA",
  support: "Support",
  viewer: "Viewer",
}
const FALLBACK_PROJECT_COLOR = "#94a3b8"

export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId") ?? "all"
  const projectScoped = !!projectId && projectId !== "all"
  // Per-person filtering is manager/admin-only; ignore the param for others.
  const canFilterByPerson = profile.role === "admin" || profile.role === "manager"
  const personId = canFilterByPerson ? (searchParams.get("personId") ?? "all") : "all"
  const personScoped = !!personId && personId !== "all"

  const now = new Date()
  const { start: periodStart, end: periodEnd } = resolveReportRange(
    searchParams.get("from"),
    searchParams.get("to"),
  )
  // Immediately-preceding window of equal length, for the "vs prev" deltas.
  const spanMs = periodEnd.getTime() - periodStart.getTime()
  const prevEnd = periodStart
  const prevStart = new Date(periodStart.getTime() - spanMs)

  const weekStart = periodStart
  const weekEnd = periodEnd
  const lastWeekStart = prevStart
  const lastWeekEnd = prevEnd

  const deptScope = await getProfileDeptScope(profile)
  // No dept scope (admin global) still bounds to the active tenant.
  const tenantId = profile.activeTenantId ?? "__no_tenant__"

  const memberWhere = {
    ...(deptScope
      ? { teamId: { in: deptScope.teamIds } }
      : { tenantMemberships: { some: { tenantId, isActive: true } } }),
    ...(personScoped ? { id: personId } : {}),
    deletedAt: null,
  }
  const ticketWhere = {
    ...(deptScope ? { teamId: { in: deptScope.teamIds } } : { tenantId }),
    ...(projectScoped ? { projectId } : {}),
    ...(personScoped ? { assigneeId: personId } : {}),
  }

  // QA is cross-departmental — a tester from another department can log QA time
  // on this department's tickets. Scope QA by the *ticket's* team (not the
  // logger's) so cross-department QA work still surfaces in the ticket's report.
  const qaTicketWhere = {
    ...(deptScope ? { teamId: { in: deptScope.teamIds } } : { tenantId }),
    ...(projectScoped ? { projectId } : {}),
  }
  const qaTicketScoped = Object.keys(qaTicketWhere).length > 0

  const [profiles, weekEntries, qaWeekEntries, closedGroups, closedLastWeek] =
    await Promise.all([
      prisma.profile.findMany({
        where: memberWhere,
        include: { team: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.timeEntry.findMany({
        where: {
          OR: [{ startedAt: { gte: weekStart, lt: weekEnd } }, { endedAt: null }],
          ...(deptScope
            ? { profile: { teamId: { in: deptScope.teamIds } } }
            : { profile: { tenantMemberships: { some: { tenantId, isActive: true } } } }),
          ...(projectScoped ? { ticket: { projectId } } : {}),
          ...(personScoped ? { profileId: personId } : {}),
          kind: "DEVELOPMENT",
        },
        include: {
          ticket: { select: { project: { select: { name: true, color: true } } } },
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          OR: [{ startedAt: { gte: weekStart, lt: weekEnd } }, { endedAt: null }],
          ...(qaTicketScoped ? { ticket: qaTicketWhere } : {}),
          ...(personScoped ? { profileId: personId } : {}),
          kind: "QA",
        },
        include: {
          ticket: { select: { project: { select: { name: true, color: true } } } },
          profile: {
            select: {
              id: true,
              name: true,
              role: true,
              avatarUrl: true,
              team: { select: { name: true } },
            },
          },
        },
      }),
      prisma.ticket.groupBy({
        by: ["assigneeId"],
        where: {
          deletedAt: null,
          closedAt: { gte: weekStart, lt: weekEnd },
          ...ticketWhere,
        },
        _count: { _all: true },
      }),
      prisma.ticket.count({
        where: {
          deletedAt: null,
          closedAt: { gte: lastWeekStart, lt: lastWeekEnd },
          ...ticketWhere,
        },
      }),
    ])

  const closedByAssignee = new Map<string | null, number>(
    closedGroups.map((g) => [g.assigneeId, g._count._all]),
  )
  const closedThisWeek = closedGroups.reduce((sum, g) => sum + g._count._all, 0)

  const members: { row: TeamMember; weekSecs: number }[] = profiles.map((member) => {
    const entries = weekEntries.filter((e) => e.profileId === member.id)
    const weekSecs = entries.reduce((sum, e) => sum + entrySeconds(e, now), 0)

    const daySecs = [0, 0, 0, 0, 0]
    for (const entry of entries) {
      if (entry.startedAt < weekStart || entry.startedAt >= weekEnd) continue
      const idx = (entry.startedAt.getDay() + 6) % 7
      if (idx < 5) daySecs[idx] += entrySeconds(entry, now)
    }
    const maxDay = Math.max(...daySecs)
    const dailyBars = daySecs.map((secs) =>
      secs === 0 || maxDay === 0 ? 2 : Math.max(4, Math.round((secs / maxDay) * 30)),
    )

    const projectSecs = new Map<string, { secs: number; color: string }>()
    for (const entry of entries) {
      const name = entry.ticket?.project?.name ?? "Internal"
      const color = entry.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR
      const current = projectSecs.get(name) ?? { secs: 0, color }
      current.secs += entrySeconds(entry, now)
      projectSecs.set(name, current)
    }
    const topProject = [...projectSecs.entries()].sort((a, b) => b[1].secs - a[1].secs)[0]

    const runningEntry = entries.find((e) => e.endedAt === null)
    const lastEnded = entries
      .filter((e) => e.endedAt !== null)
      .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))[0]

    return {
      weekSecs,
      row: {
        id: member.id,
        name: member.name,
        role: ROLE_LABEL[member.role] ?? member.role,
        location: member.team?.name ?? "No team",
        avatarColor: avatarColorFor(member.name),
        avatarUrl: member.avatarUrl ?? null,
        weekHours: formatHm(weekSecs),
        weekProgress: Math.min(100, Math.round((weekSecs / WEEK_TARGET_SECS) * 100)),
        dailyBars,
        topProject: topProject ? topProject[0] : "—",
        projectColor: topProject ? topProject[1].color : FALLBACK_PROJECT_COLOR,
        closed: closedByAssignee.get(member.id) ?? 0,
        active: runningEntry
          ? "Now"
          : lastEnded?.endedAt
            ? relativeAgo(lastEnded.endedAt, now)
            : "—",
        activeNow: Boolean(runningEntry),
      },
    }
  })

  members.sort(
    (a, b) => b.weekSecs - a.weekSecs || a.row.name.localeCompare(b.row.name),
  )

  const vsLabel = "vs prev period"

  const totalSecs = members.reduce((sum, m) => sum + m.weekSecs, 0)
  const closedDiff = closedThisWeek - closedLastWeek
  const closedDetail =
    closedDiff === 0
      ? `same as previous period`
      : `${closedDiff > 0 ? "+" : "−"}${Math.abs(closedDiff)} ${vsLabel}`

  const stats: StatCard[] = [
    {
      label: "DEV HOURS",
      value: `${Math.round(totalSecs / 3600)}h`,
      detail: `across ${profiles.length} ${profiles.length === 1 ? "person" : "people"}`,
    },
    {
      label: "TICKETS CLOSED",
      value: `${closedThisWeek}`,
      detail: closedDetail,
      detailClassName: closedDiff >= 0 ? "text-pen-green" : undefined,
    },
  ]

  // Per-project time overview (same entry set as the member rollup)
  const projAgg = new Map<
    string,
    { secs: number; color: string; contributors: Set<string> }
  >()
  for (const entry of weekEntries) {
    const name = entry.ticket?.project?.name ?? "Internal"
    const color = entry.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR
    const cur = projAgg.get(name) ?? { secs: 0, color, contributors: new Set<string>() }
    cur.secs += entrySeconds(entry, now)
    cur.contributors.add(entry.profileId)
    projAgg.set(name, cur)
  }
  const projTotalSecs = [...projAgg.values()].reduce((s, p) => s + p.secs, 0) || 1
  const projects: ProjectTimeRow[] = [...projAgg.entries()]
    .map(([name, p]) => ({
      name,
      color: p.color,
      secs: p.secs,
      hours: formatHm(p.secs),
      share: Math.round((p.secs / projTotalSecs) * 100),
      contributors: p.contributors.size,
    }))
    .filter((p) => p.secs > 0)
    .sort((a, b) => b.secs - a.secs)

  // ── QA time (separate from development hours) ─────────────────────────────
  // Build the tester list from whoever actually logged QA time (which may include
  // people outside the active department), not from the dept member roster.
  const qaProfiles = new Map<string, (typeof qaWeekEntries)[number]["profile"]>()
  for (const entry of qaWeekEntries) {
    if (entry.profile && !qaProfiles.has(entry.profileId)) {
      qaProfiles.set(entry.profileId, entry.profile)
    }
  }
  const qaMembers: { row: TeamMember; weekSecs: number }[] = [...qaProfiles.values()].map((member) => {
    const entries = qaWeekEntries.filter((e) => e.profileId === member.id)
    const weekSecs = entries.reduce((sum, e) => sum + entrySeconds(e, now), 0)
    const daySecs = [0, 0, 0, 0, 0]
    for (const entry of entries) {
      if (entry.startedAt < weekStart || entry.startedAt >= weekEnd) continue
      const idx = (entry.startedAt.getDay() + 6) % 7
      if (idx < 5) daySecs[idx] += entrySeconds(entry, now)
    }
    const maxDay = Math.max(...daySecs)
    const dailyBars = daySecs.map((secs) =>
      secs === 0 || maxDay === 0 ? 2 : Math.max(4, Math.round((secs / maxDay) * 30)),
    )
    const projectSecs = new Map<string, { secs: number; color: string }>()
    for (const entry of entries) {
      const name = entry.ticket?.project?.name ?? "Internal"
      const color = entry.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR
      const current = projectSecs.get(name) ?? { secs: 0, color }
      current.secs += entrySeconds(entry, now)
      projectSecs.set(name, current)
    }
    const topProject = [...projectSecs.entries()].sort((a, b) => b[1].secs - a[1].secs)[0]
    const runningEntry = entries.find((e) => e.endedAt === null)
    return {
      weekSecs,
      row: {
        id: member.id,
        name: member.name,
        role: ROLE_LABEL[member.role] ?? member.role,
        location: member.team?.name ?? "No team",
        avatarColor: avatarColorFor(member.name),
        avatarUrl: member.avatarUrl ?? null,
        weekHours: formatHm(weekSecs),
        weekProgress: Math.min(100, Math.round((weekSecs / WEEK_TARGET_SECS) * 100)),
        dailyBars,
        topProject: topProject ? topProject[0] : "—",
        projectColor: topProject ? topProject[1].color : FALLBACK_PROJECT_COLOR,
        closed: 0,
        active: runningEntry ? "Now" : "—",
        activeNow: Boolean(runningEntry),
      },
    }
  })
  qaMembers.sort(
    (a, b) => b.weekSecs - a.weekSecs || a.row.name.localeCompare(b.row.name),
  )
  const qaTotalSecs = qaMembers.reduce((sum, m) => sum + m.weekSecs, 0)
  const qaStats: StatCard[] =
    qaTotalSecs > 0
      ? [
          {
            label: "QA HOURS",
            value: `${Math.round(qaTotalSecs / 3600)}h`,
            detail: `${qaMembers.filter((m) => m.weekSecs > 0).length} tester${qaMembers.filter((m) => m.weekSecs > 0).length === 1 ? "" : "s"}`,
          },
        ]
      : []
  const qaProjAgg = new Map<
    string,
    { secs: number; color: string; contributors: Set<string> }
  >()
  for (const entry of qaWeekEntries) {
    const name = entry.ticket?.project?.name ?? "Internal"
    const color = entry.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR
    const cur = qaProjAgg.get(name) ?? { secs: 0, color, contributors: new Set<string>() }
    cur.secs += entrySeconds(entry, now)
    cur.contributors.add(entry.profileId)
    qaProjAgg.set(name, cur)
  }
  const qaProjTotalSecs = [...qaProjAgg.values()].reduce((s, p) => s + p.secs, 0) || 1
  const qaProjects: ProjectTimeRow[] = [...qaProjAgg.entries()]
    .map(([name, p]) => ({
      name,
      color: p.color,
      secs: p.secs,
      hours: formatHm(p.secs),
      share: Math.round((p.secs / qaProjTotalSecs) * 100),
      contributors: p.contributors.size,
    }))
    .filter((p) => p.secs > 0)
    .sort((a, b) => b.secs - a.secs)

  const response: TeamTimeResponse = {
    stats,
    members: members.map((m) => m.row),
    projects,
    qaStats,
    qaProjects,
    qaMembers: qaMembers.filter((m) => m.weekSecs > 0).map((m) => m.row),
  }

  return NextResponse.json(response)
}
