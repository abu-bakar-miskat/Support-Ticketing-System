import "server-only"
import { prisma } from "@/lib/db"
import {
  buildPeopleMembershipWhere,
  getProfileDeptScope,
  effectiveTicketDept,
} from "@/lib/dept-scope"
import { isDueOverdue, isBlockedStatus } from "@/lib/format"
import { fetchContributionsByDay } from "@/lib/profile/github-contributions"
import type { ContributionCalendar } from "@/lib/profile/contribution-buckets"
import { formatHm } from "@/lib/time-data"

const URGENT_PRIORITIES = new Set(["Critical", "High", "Urgent"])

function isUrgent(priority: string) {
  return URGENT_PRIORITIES.has(priority)
}

function isReview(status: string) {
  const s = status.toLowerCase()
  return s.includes("pull request") || s.includes("review") || s === "pr"
}

const TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  storyPoints: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      name: true,
      color: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      team: { select: { department: { select: { id: true, name: true } } } },
    },
  },
  team: {
    select: {
      id: true,
      prefix: true,
      name: true,
      department: { select: { id: true, name: true } },
    },
  },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const

type TicketRow = Awaited<
  ReturnType<typeof prisma.ticket.findMany<{ select: typeof TICKET_SELECT }>>
>[number]

export type ProfileStatsTicketSummary = {
  id: string
  humanId: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  storyPoints: number | null
  project: { id: string; name: string; color: string | null } | null
  assignee: { name: string; avatarUrl: string | null } | null
  department: { id: string; name: string } | null
  isOutsideContribution: boolean
  isComplete: boolean
}

export type ProfileStatsDeptContribution = {
  departmentId: string
  departmentName: string
  isHome: boolean
  total: number
  completed: number
  overdue: number
  storyPoints: number
  created: number
  loggedSecs: number
}

type ViewerProfile = {
  id: string
  role: string
  teamId?: string | null
  teamIds?: string[]
  managedDepartmentIds?: string[]
  grantedAccessDeptIds?: string[]
  activeTenantId?: string | null
}

export type ProfileStatsResult = {
  profile: {
    id: string
    name: string
    email: string
    role: string
    avatarUrl: string | null
    teamName: string | null
    memberSince: string
    homeDepartmentNames: string[]
    githubUsername: string | null
  }
  stats: {
    total: number
    completed: number
    inProgress: number
    overdue: number
    blocked: number
    review: number
    created: number
    comments: number
    activities: number
    completionRate: number
    onTimeRate: number
    onTimeCompleted: number
    onTimeTotal: number
    urgentRate: number
    urgentTotal: number
    urgentCompleted: number
    projectCount: number
    avgCompletionDays: number | null
    avgCycleDays: number | null
    outsideContributions: number
    homeContributions: number
    qaOpen: number
    qaDone: number
    hasQaAssignment: boolean
  }
  timeLogged: {
    developmentSecs: number
    qaSecs: number
    developmentLabel: string
    qaLabel: string
  }
  tickets: Record<
    | "total"
    | "completed"
    | "inProgress"
    | "overdue"
    | "blocked"
    | "review"
    | "created"
    | "qaOpen"
    | "qaDone",
    ProfileStatsTicketSummary[]
  >
  byPriority: Record<string, number>
  byProject: {
    id: string
    name: string
    color: string | null
    total: number
    completed: number
    overdue: number
    storyPoints: number
  }[]
  byDepartment: ProfileStatsDeptContribution[]
  activityByDay: Record<string, number>
  contributionsByDay: ContributionCalendar
  recentActivity: {
    id: string
    action: string
    ticketId: string | null
    ticketTitle: string | null
    ticketHumanId: string | null
    createdAt: string
    meta: {
      from: string | null
      to: string | null
      toName: string | null
      fromName: string | null
      fileName: string | null
    }
  }[]
  projectsForFilter: { id: string; name: string; color: string | null }[]
  people: { id: string; name: string; avatarUrl: string | null }[]
  isManager: boolean
  dateRange: { from: string; to: string }
  isOwnProfile: boolean
}

async function getTargetHomeDepartmentIds(targetId: string): Promise<Set<string>> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId: targetId, isActive: true },
    select: { team: { select: { departmentId: true } } },
  })
  const homeTeamDept = await prisma.profile.findUnique({
    where: { id: targetId },
    select: { team: { select: { departmentId: true } } },
  })

  const ids = new Set<string>()
  for (const m of memberships) {
    if (m.team.departmentId) ids.add(m.team.departmentId)
  }
  if (homeTeamDept?.team?.departmentId) ids.add(homeTeamDept.team.departmentId)
  return ids
}

function toTicketSummary(
  t: TicketRow,
  homeDeptIds: Set<string>,
  doneByTeam: Map<string, Set<string>>,
): ProfileStatsTicketSummary {
  const dept = effectiveTicketDept(t)
  const deptId = dept?.id ?? null
  const isOutside =
    deptId !== null ? !homeDeptIds.has(deptId) : homeDeptIds.size > 0

  return {
    id: t.id,
    humanId: `${t.team.prefix}-${t.ticketNumber}`,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    storyPoints: t.storyPoints ?? null,
    project: t.project
      ? { id: t.project.id, name: t.project.name, color: t.project.color }
      : null,
    assignee: t.assignee
      ? { name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
      : null,
    department: dept ? { id: dept.id, name: dept.name } : null,
    isOutsideContribution: isOutside,
    isComplete: doneByTeam.get(t.team.id)?.has(t.status) ?? false,
  }
}

export async function fetchProfileStats(opts: {
  viewer: ViewerProfile
  targetId: string
  fromDate: Date
  toDate: Date
  projectId?: string
}): Promise<
  | { ok: true; data: ProfileStatsResult }
  | { ok: false; status: 403 | 404; error: string }
> {
  const { viewer, targetId, fromDate, toDate, projectId } = opts

  if (targetId !== viewer.id) {
    const canViewOthers = ["admin", "manager", "lead"].includes(viewer.role)
    if (!canViewOthers) {
      return { ok: false, status: 403, error: "Forbidden" }
    }
  }

  const targetProfile = await prisma.profile.findUnique({
    where: { id: targetId },
    include: { team: { select: { id: true, name: true } } },
  })
  if (!targetProfile) {
    return { ok: false, status: 404, error: "Profile not found" }
  }

  const isOwnProfile = targetId === viewer.id
  const targetIsManager =
    targetProfile.role === "manager" || targetProfile.role === "admin"
  const isPrivileged = ["admin", "manager", "lead"].includes(viewer.role)

  const deptScope = await getProfileDeptScope(viewer)
  const peopleWhere = buildPeopleMembershipWhere(viewer, deptScope)

  const homeDeptIds = await getTargetHomeDepartmentIds(targetId)
  const homeDeptRecords =
    homeDeptIds.size > 0
      ? await prisma.department.findMany({
          where: { id: { in: [...homeDeptIds] } },
          select: { name: true },
          orderBy: { name: "asc" },
        })
      : []

  // Profile stats always show the target's full contribution history.
  // Department scope only gates who can view the profile, not which tickets appear.
  const baseWhere = {
    assigneeId: targetId,
    deletedAt: null as null,
    ...(projectId ? { projectId } : {}),
    createdAt: { gte: fromDate, lte: toDate },
  }

  const managedTeamIds: string[] = targetIsManager
    ? await prisma.teamMembership
        .findMany({
          where: { userId: targetId, isActive: true },
          select: { teamId: true },
        })
        .then((r) => r.map((m) => m.teamId))
    : []

  const reviewTeamIds = deptScope
    ? managedTeamIds.filter((id) => deptScope.teamIds.includes(id))
    : managedTeamIds

  const [
    assignedTickets,
    reviewTickets,
    comments,
    createdTickets,
    activityLogs,
    allUserProjects,
    teamMembersRaw,
  ] = await Promise.all([
    prisma.ticket.findMany({ where: baseWhere, select: TICKET_SELECT }),

    targetIsManager && reviewTeamIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            teamId: { in: reviewTeamIds },
            updatedAt: { gte: fromDate, lte: toDate },
            ...(projectId ? { projectId } : {}),
            OR: [
              { status: { contains: "pull request", mode: "insensitive" } },
              { status: { contains: "review", mode: "insensitive" } },
              { status: { equals: "PR", mode: "insensitive" } },
            ],
          },
          select: TICKET_SELECT,
        })
      : Promise.resolve([] as TicketRow[]),

    prisma.comment.count({
      where: {
        authorId: targetId,
        deletedAt: null,
        createdAt: { gte: fromDate, lte: toDate },
      },
    }),

    prisma.ticket.findMany({
      where: {
        creatorId: targetId,
        deletedAt: null,
        createdAt: { gte: fromDate, lte: toDate },
        ...(projectId ? { projectId } : {}),
      },
      select: TICKET_SELECT,
      orderBy: { createdAt: "desc" },
    }),

    prisma.activityLog.findMany({
      where: {
        actorId: targetId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            title: true,
            ticketNumber: true,
            team: { select: { prefix: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),

    prisma.ticket.findMany({
      where: { assigneeId: targetId, deletedAt: null },
      select: { project: { select: { id: true, name: true, color: true } } },
      distinct: ["projectId"],
    }),

    peopleWhere && isPrivileged
      ? prisma.teamMembership.findMany({
          where: peopleWhere,
          select: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { user: { name: "asc" } },
          distinct: ["userId"],
        })
      : viewer.role === "admin" && !deptScope
        ? prisma.profile.findMany({
            where: {
              role: { not: "admin" },
              tenantMemberships: { some: { tenantId: viewer.activeTenantId ?? "__no_tenant__", isActive: true } },
            },
            select: { id: true, name: true, avatarUrl: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
  ])

  const people: { id: string; name: string; avatarUrl: string | null }[] =
    viewer.role === "admin" && !deptScope
      ? (teamMembersRaw as { id: string; name: string; avatarUrl: string | null }[])
      : (
          teamMembersRaw as {
            user: { id: string; name: string; avatarUrl: string | null }
          }[]
        ).map((m) => m.user)

  if (!isOwnProfile) {
    const allowedIds = new Set(people.map((p) => p.id))
    if (!allowedIds.has(targetId)) {
      return { ok: false, status: 403, error: "Forbidden" }
    }
  }

  const now = new Date()

  // Also fetch sub-tickets where the user is a co-assignee (TicketAssignee)
  const coAssignedSubtickets = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      parentId: { not: null },
      assignees: { some: { userId: targetId } },
      assigneeId: { not: targetId }, // exclude those already in assignedTickets
      createdAt: { gte: fromDate, lte: toDate },
      ...(projectId ? { projectId } : {}),
    },
    select: TICKET_SELECT,
  })

  // QA tasks — tickets where the target is a QA assignee (counted separately
  // from dev work so a tester's QA contribution is justified on its own axis).
  const [qaTickets, qaAssignmentCount] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        deletedAt: null,
        qaAssignees: { some: { userId: targetId } },
        createdAt: { gte: fromDate, lte: toDate },
        ...(projectId ? { projectId } : {}),
      },
      select: TICKET_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.ticketQaAssignee.count({ where: { userId: targetId } }),
  ])
  const hasQaAssignment = qaAssignmentCount > 0

  // Logged time (development vs QA) in the selected period — separate from ticket counts.
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      profileId: targetId,
      startedAt: { gte: fromDate, lte: toDate },
      endedAt: { not: null },
      ...(projectId ? { ticket: { projectId } } : {}),
    },
    select: {
      durationSecs: true,
      kind: true,
      ticket: {
        select: {
          project: {
            select: {
              departmentId: true,
              department: { select: { id: true, name: true } },
              team: { select: { department: { select: { id: true, name: true } } } },
            },
          },
          team: {
            select: {
              department: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })
  let developmentSecs = 0
  let qaSecs = 0
  for (const e of timeEntries) {
    const secs = e.durationSecs ?? 0
    if (e.kind === "QA") qaSecs += secs
    else developmentSecs += secs
  }

  const allTickets = [...assignedTickets, ...coAssignedSubtickets]

  const uniqueTeamIds = [
    ...new Set([...allTickets, ...qaTickets, ...createdTickets].map((t) => t.team.id)),
  ]
  const completeStatuses = uniqueTeamIds.length > 0
    ? await prisma.teamStatus.findMany({
        where: { teamId: { in: uniqueTeamIds }, isComplete: true },
        select: { teamId: true, label: true },
      })
    : []

  // Per-team complete label sets for accurate classification
  const doneByTeam = new Map<string, Set<string>>()
  for (const s of completeStatuses) {
    const set = doneByTeam.get(s.teamId) ?? new Set<string>()
    set.add(s.label)
    doneByTeam.set(s.teamId, set)
  }
  const isDone = (t: { team: { id: string }; status: string }) =>
    doneByTeam.get(t.team.id)?.has(t.status) ?? false

  const cats = {
    total: allTickets,
    completed: allTickets.filter(isDone),
    inProgress: allTickets.filter(
      (t) =>
        !isDone(t) &&
        !isReview(t.status) &&
        !isBlockedStatus(t.status) &&
        t.status !== "Not Started" &&
        t.status !== "To Do",
    ),
    overdue: allTickets.filter(
      (t) => isDueOverdue(t.dueDate, now) && !isDone(t) && !isBlockedStatus(t.status),
    ),
    blocked: allTickets.filter((t) => isBlockedStatus(t.status) && !isDone(t)),
    review: reviewTickets,
  }

  const completedWithDue = cats.completed.filter((t) => t.dueDate)
  const completedOnTime = completedWithDue.filter(
    (t) => new Date(t.updatedAt) <= new Date(t.dueDate!),
  )
  const onTimeRate =
    completedWithDue.length > 0
      ? completedOnTime.length / completedWithDue.length
      : cats.completed.length > 0
        ? 1
        : 0

  const urgentAll = allTickets.filter((t) => isUrgent(t.priority))
  const urgentCompleted = urgentAll.filter(isDone)
  const urgentRate =
    urgentAll.length > 0 ? urgentCompleted.length / urgentAll.length : 1

  const completionRate =
    cats.total.length > 0 ? cats.completed.length / cats.total.length : 0

  const qaOpenTickets = qaTickets.filter((t) => !isDone(t))
  const qaDoneTickets = qaTickets.filter(isDone)

  const actByDay: Record<string, number> = {}
  for (const a of activityLogs) {
    const day = a.createdAt.toISOString().slice(0, 10)
    actByDay[day] = (actByDay[day] ?? 0) + 1
  }

  const byPriority: Record<string, number> = {}
  for (const t of allTickets) {
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1
  }

  const projMap = new Map<
    string,
    {
      name: string
      color: string | null
      total: number
      completed: number
      overdue: number
      storyPoints: number
    }
  >()
  for (const t of allTickets) {
    if (!t.project) continue
    const e = projMap.get(t.project.id) ?? {
      name: t.project.name,
      color: t.project.color,
      total: 0,
      completed: 0,
      overdue: 0,
      storyPoints: 0,
    }
    e.total++
    e.storyPoints += t.storyPoints ?? 0
    if (isDone(t)) e.completed++
    if (isDueOverdue(t.dueDate, now) && !isDone(t) && !isBlockedStatus(t.status)) {
      e.overdue++
    }
    projMap.set(t.project.id, e)
  }

  const projectCount = projMap.size

  const deptMap = new Map<
    string,
    ProfileStatsDeptContribution & { _unknown?: boolean }
  >()
  let homeContributions = 0
  let outsideContributions = 0

  const deptEntry = (dept: { id: string; name: string } | null) => {
    const deptId = dept?.id ?? "__unknown__"
    const deptName = dept?.name ?? "Unknown department"
    const isHome = dept ? homeDeptIds.has(dept.id) : false
    const e = deptMap.get(deptId) ?? {
      departmentId: deptId,
      departmentName: deptName,
      isHome,
      total: 0,
      completed: 0,
      overdue: 0,
      storyPoints: 0,
      created: 0,
      loggedSecs: 0,
    }
    deptMap.set(deptId, e)
    return e
  }

  for (const t of allTickets) {
    const dept = effectiveTicketDept(t)
    const isHome = dept ? homeDeptIds.has(dept.id) : false

    if (isHome) homeContributions++
    else outsideContributions++

    const e = deptEntry(dept)
    e.total++
    e.storyPoints += t.storyPoints ?? 0
    if (isDone(t)) e.completed++
    if (isDueOverdue(t.dueDate, now) && !isDone(t) && !isBlockedStatus(t.status)) {
      e.overdue++
    }
  }

  for (const t of createdTickets) {
    deptEntry(effectiveTicketDept(t)).created++
  }

  for (const entry of timeEntries) {
    deptEntry(entry.ticket ? effectiveTicketDept(entry.ticket) : null).loggedSecs +=
      entry.durationSecs ?? 0
  }

  const byDepartment = [...deptMap.values()]
    .filter((d) => d.departmentId !== "__unknown__")
    .sort((a, b) => {
      if (a.isHome !== b.isHome) return a.isHome ? -1 : 1
      return b.total - a.total
    })

  const avgCompletionDays =
    cats.completed.length > 0
      ? Math.round(
          (cats.completed.reduce((s, t) => {
            const ms =
              new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()
            return s + ms / 86400_000
          }, 0) /
            cats.completed.length) *
            10,
        ) / 10
      : null

  const avgCycleDays = avgCompletionDays

  const recentActivity = activityLogs.map((a) => {
    const md = a.metadata as Record<string, unknown>
    return {
      id: a.id,
      action: a.action,
      ticketId: a.ticket?.id ?? null,
      ticketTitle: a.ticket?.title ?? null,
      ticketHumanId: a.ticket
        ? `${a.ticket.team.prefix}-${a.ticket.ticketNumber}`
        : null,
      createdAt: a.createdAt.toISOString(),
      meta: {
        from: (md.from as string | undefined) ?? null,
        to: (md.to as string | undefined) ?? null,
        toName:
          (md.toName as string | undefined) ??
          (md.mentionedName as string | undefined) ??
          null,
        fromName: (md.fromName as string | undefined) ?? null,
        fileName: (md.fileName as string | undefined) ?? null,
      },
    }
  })

  const contributionsByDay = targetProfile.githubUsername
    ? await fetchContributionsByDay({
        githubUsername: targetProfile.githubUsername,
        tz: targetProfile.timezone ?? undefined,
      })
    : {}

  return {
    ok: true,
    data: {
      profile: {
        id: targetProfile.id,
        name: targetProfile.name,
        email: targetProfile.email,
        role: targetProfile.role,
        avatarUrl: targetProfile.avatarUrl,
        teamName: targetProfile.team?.name ?? null,
        memberSince: targetProfile.createdAt.toISOString(),
        homeDepartmentNames: homeDeptRecords.map((d) => d.name),
        githubUsername: targetProfile.githubUsername,
      },
      stats: {
        total: cats.total.length,
        completed: cats.completed.length,
        inProgress: cats.inProgress.length,
        overdue: cats.overdue.length,
        blocked: cats.blocked.length,
        review: cats.review.length,
        created: createdTickets.length,
        comments,
        activities: activityLogs.length,
        completionRate: Math.round(completionRate * 100),
        onTimeRate: Math.round(onTimeRate * 100),
        onTimeCompleted: completedOnTime.length,
        onTimeTotal: completedWithDue.length,
        urgentRate: Math.round(urgentRate * 100),
        urgentTotal: urgentAll.length,
        urgentCompleted: urgentCompleted.length,
        projectCount,
        avgCompletionDays,
        avgCycleDays,
        homeContributions,
        outsideContributions,
        qaOpen: qaOpenTickets.length,
        qaDone: qaDoneTickets.length,
        hasQaAssignment,
      },
      timeLogged: {
        developmentSecs,
        qaSecs,
        developmentLabel: formatHm(developmentSecs),
        qaLabel: formatHm(qaSecs),
      },
      tickets: {
        total: cats.total.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        completed: cats.completed.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        inProgress: cats.inProgress.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        overdue: cats.overdue.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        blocked: cats.blocked.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        review: cats.review.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        created: createdTickets.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        qaOpen: qaOpenTickets.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
        qaDone: qaDoneTickets.map((t) => toTicketSummary(t, homeDeptIds, doneByTeam)),
      },
      byPriority,
      byProject: [...projMap.entries()].map(([id, v]) => ({ id, ...v })),
      byDepartment,
      activityByDay: actByDay,
      contributionsByDay,
      recentActivity,
      projectsForFilter: allUserProjects
        .filter((t) => t.project)
        .map((t) => ({
          id: t.project!.id,
          name: t.project!.name,
          color: t.project!.color,
        })),
      people,
      isManager: targetIsManager,
      dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      isOwnProfile,
    },
  }
}
