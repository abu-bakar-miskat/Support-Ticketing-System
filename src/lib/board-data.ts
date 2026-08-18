import "server-only"
import { prisma } from "@/lib/db"
import type { TicketGetPayload } from "@/generated/prisma/models/Ticket"
import type { BoardCardData, UiPriority, SubDepartmentStatusConfig, SubDepartmentBoardGroup } from "@/components/board/board-types"
import { DEFAULT_STATUSES } from "@/components/board/board-types"

const PRIORITY_TO_UI: Record<string, UiPriority> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
}

import { avatarColorFor } from "@/lib/avatar"
import { formatTicketDue, isBlockedStatus } from "@/lib/format"
import { dueHasTime, formatTimeHM, formatCalendarDate } from "@/lib/ticket-datetime"

export { avatarColorFor }

function formatDue(
  dueDate: Date | null,
  status: string,
  isStatusComplete: boolean,
): { due: string | null; dueUrgent: boolean; dueOverdue: boolean } {
  const { due, dueUrgent, dueOverdue } = formatTicketDue(dueDate, new Date(), {
    isStatusComplete,
    isBlocked: isBlockedStatus(status),
  })
  const withTime =
    due && dueDate && dueHasTime(dueDate) ? `${due} · ${formatTimeHM(dueDate)}` : due
  return { due: withTime, dueUrgent, dueOverdue }
}

const ticketInclude = {
  subDepartment: { select: { id: true, prefix: true, name: true } },
  project: { select: { id: true, name: true, slug: true, color: true, avatarUrl: true, kind: true } },
  module: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  creator: { select: { id: true, name: true, avatarUrl: true } },
  assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  qaAssignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  estimates: { select: { targetDate: true } },
  subTickets: {
    where: { deletedAt: null, isDraft: false },
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      ticketNumber: true,
      startDate: true,
      dueDate: true,
      subDepartment: { select: { prefix: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  _count: { select: { comments: { where: { deletedAt: null } }, attachments: true, messages: true } },
  intake: { select: { id: true } },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { direction: true },
  },
} as const

type TicketWithRelations = TicketGetPayload<{ include: typeof ticketInclude }>

export function toBoardCard(
  t: TicketWithRelations,
  timeByTicketId: Map<string, number> = new Map(),
  userTimeByTicketId: Map<string, number> = new Map(),
  completeLabels: Set<string> = new Set(),
): BoardCardData {
  const isStatusComplete = completeLabels.has(t.status) || t.status === "Live"
  const { due, dueUrgent, dueOverdue } = formatDue(t.dueDate, t.status, isStatusComplete)
  const ownSecs = timeByTicketId.get(t.id) ?? 0
  const subSecs = t.subTickets.reduce((sum, s) => sum + (timeByTicketId.get(s.id) ?? 0), 0)
  return {
    dbId: t.id,
    humanId: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    title: t.title,
    priority: PRIORITY_TO_UI[t.priority] ?? "medium",
    status: t.status,
    subDepartment: t.subDepartment.name,
    subDepartmentId: t.subDepartment.id,
    project: t.project?.name ?? "Miscellaneous",
    projectId: t.project?.id ?? "",
    projectKind: t.project?.kind ?? "standard",
    projectColor: t.project?.color ?? null,
    projectAvatarUrl: t.project?.avatarUrl ?? null,
    moduleId: t.moduleId ?? null,
    moduleName: t.module?.name ?? null,
    labels: t.labels,
    comments: t._count.comments,
    messages: t._count.messages,
    attachments: t._count.attachments,
    subDone: t.subTickets.filter((s) => completeLabels.has(s.status) || s.status === "Live").length,
    subTotal: t.subTickets.length,
    subTicketCards: t.subTickets.map((s) => ({
      dbId: s.id,
      humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`,
      title: s.title,
      status: s.status,
      done: completeLabels.has(s.status) || s.status === "Live",
      priority: PRIORITY_TO_UI[s.priority] ?? "medium",
      assigneeId: s.assignee?.id ?? null,
      assigneeName: s.assignee?.name ?? null,
      avatarColor: s.assignee ? avatarColorFor(s.assignee.name) : null,
      assigneeAvatarUrl: s.assignee?.avatarUrl ?? null,
      startDateIso: s.startDate ? formatCalendarDate(s.startDate) : null,
      dueDateIso: s.dueDate ? formatCalendarDate(s.dueDate) : null,
    })),
    assigneeId: t.assignee?.id ?? null,
    assigneeName: t.assignee?.name ?? null,
    avatarColor: t.assignee ? avatarColorFor(t.assignee.name) : null,
    assigneeAvatarUrl: t.assignee?.avatarUrl ?? null,
    coAssignees: t.assignees.map((a) => ({ id: a.user.id, name: a.user.name, color: avatarColorFor(a.user.name), avatarUrl: a.user.avatarUrl ?? null })),
    qaAssignees: t.qaAssignees.map((a) => ({ id: a.user.id, name: a.user.name, color: avatarColorFor(a.user.name), avatarUrl: a.user.avatarUrl ?? null })),
    creatorId: t.creator.id,
    creatorName: t.creator.name,
    creatorAvatarUrl: t.creator.avatarUrl ?? null,
    time: null,
    totalLoggedSecs: ownSecs + subSecs,
    userLoggedSecs: userTimeByTicketId.get(t.id) ?? 0,
    estimatedTime: t.estimatedTime ?? null,
    startDate: t.startDate
      ? t.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : null,
    startDateIso: t.startDate ? formatCalendarDate(t.startDate) : null,
    due,
    dueDateIso: t.dueDate ? formatCalendarDate(t.dueDate) : null,
    dueUrgent,
    dueOverdue,
    targetDateIsos: t.estimates
      .filter((e) => e.targetDate)
      .map((e) => formatCalendarDate(e.targetDate!)),
    createdIso: t.createdAt.toISOString(),
    hasIntake: !!t.intake,
    isComplete: isStatusComplete,
    lastMessageDirection: (t.messages[0]?.direction as "inbound" | "outbound") ?? null,
  }
}

export type AssignedSubtask = {
  dbId: string
  humanId: string
  title: string
  status: string
  priority: UiPriority
  parentDbId: string
  parentHumanId: string
  parentTitle: string
  project: string
  projectId: string
  projectColor: string | null
  projectAvatarUrl?: string | null
  subDepartment: string
  subDepartmentId: string
  due: string | null
  dueUrgent: boolean
  dueOverdue: boolean
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
  creatorName: string | null
  creatorAvatarUrl: string | null
  userLoggedSecs: number
  estimatedTime: number | null
}

export async function getAssignedSubtasks(
  assigneeId: string,
  opts: { allowedDeptIds?: string[] } = {},
): Promise<AssignedSubtask[]> {
  const subtasks = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      isDraft: false,
      parentId: { not: null },
      assigneeId,
      ...(opts.allowedDeptIds
        ? { subDepartment: { departmentId: { in: opts.allowedDeptIds } } }
        : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      ticketNumber: true,
      dueDate: true,
      createdAt: true,
      subDepartment: { select: { id: true, name: true, prefix: true } },
      project: { select: { id: true, name: true, color: true, avatarUrl: true } },
      estimatedTime: true,
      creator: { select: { name: true, avatarUrl: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      parent: {
        select: {
          id: true,
          title: true,
          ticketNumber: true,
          subDepartment: { select: { prefix: true } },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  })

  const subDepartmentIds = [...new Set(subtasks.map((s) => s.subDepartment.id))]
  const subtaskIds = subtasks.filter((s) => s.parent !== null).map((s) => s.id)
  const [completeStatuses, userTimeAggs] = await Promise.all([
    subDepartmentIds.length > 0
      ? prisma.subDepartmentStatus.findMany({
          where: { subDepartmentId: { in: subDepartmentIds }, isComplete: true },
          select: { subDepartmentId: true, label: true },
        })
      : Promise.resolve([]),
    subtaskIds.length > 0
      ? prisma.timeEntry.groupBy({
          by: ["ticketId"],
          where: { ticketId: { in: subtaskIds }, endedAt: { not: null }, profileId: assigneeId, kind: "DEVELOPMENT" },
          _sum: { durationSecs: true },
        })
      : Promise.resolve([]),
  ])
  const completeBySubDepartment = new Map<string, Set<string>>()
  for (const s of completeStatuses) {
    const set = completeBySubDepartment.get(s.subDepartmentId) ?? new Set<string>()
    set.add(s.label)
    completeBySubDepartment.set(s.subDepartmentId, set)
  }
  const toTimeMap = (aggs: { ticketId: string | null; _sum: { durationSecs: number | null } }[]) =>
    new Map(aggs.filter((a) => a.ticketId !== null).map((a) => [a.ticketId as string, a._sum.durationSecs ?? 0]))
  const userTimeMap = toTimeMap(userTimeAggs)

  return subtasks
    .filter((s) => s.parent !== null)
    .map((s) => {
      const isStatusComplete = (completeBySubDepartment.get(s.subDepartment.id) ?? new Set()).has(s.status)
      const { due, dueUrgent, dueOverdue } = formatDue(s.dueDate, s.status, isStatusComplete)
      return {
        dbId: s.id,
        humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`,
        title: s.title,
        status: s.status,
        priority: PRIORITY_TO_UI[s.priority] ?? "medium",
        parentDbId: s.parent!.id,
        parentHumanId: `${s.parent!.subDepartment.prefix}-${s.parent!.ticketNumber}`,
        parentTitle: s.parent!.title,
        project: s.project?.name ?? "Miscellaneous",
        projectId: s.project?.id ?? "",
        projectColor: s.project?.color ?? null,
        projectAvatarUrl: s.project?.avatarUrl ?? null,
        subDepartment: s.subDepartment.name,
        subDepartmentId: s.subDepartment.id,
        due,
        dueUrgent,
        dueOverdue,
        assigneeId: s.assignee?.id ?? null,
        assigneeName: s.assignee?.name ?? null,
        assigneeAvatarUrl: s.assignee?.avatarUrl ?? null,
        creatorName: s.creator?.name ?? null,
        creatorAvatarUrl: s.creator?.avatarUrl ?? null,
        userLoggedSecs: userTimeMap.get(s.id) ?? 0,
        estimatedTime: s.estimatedTime ?? null,
      }
    })
}

async function buildTimeMaps(
  tickets: TicketWithRelations[],
  forUserId?: string,
): Promise<{ totalMap: Map<string, number>; userMap: Map<string, number> }> {
  const allIds = tickets.flatMap((t) => [t.id, ...t.subTickets.map((s) => s.id)])
  if (allIds.length === 0) {
    return { totalMap: new Map(), userMap: new Map() }
  }

  const baseWhere = { ticketId: { in: allIds }, endedAt: { not: null } as const, kind: "DEVELOPMENT" as const }

  const [totalAggs, userAggs] = await Promise.all([
    prisma.timeEntry.groupBy({
      by: ["ticketId"],
      where: baseWhere,
      _sum: { durationSecs: true },
    }),
    forUserId
      ? prisma.timeEntry.groupBy({
          by: ["ticketId"],
          where: { ...baseWhere, profileId: forUserId },
          _sum: { durationSecs: true },
        })
      : Promise.resolve([]),
  ])

  const toMap = (aggs: typeof totalAggs) =>
    new Map(
      aggs
        .filter((a) => a.ticketId !== null)
        .map((a) => [a.ticketId as string, a._sum.durationSecs ?? 0]),
    )

  return { totalMap: toMap(totalAggs), userMap: toMap(userAggs) }
}

export type BoardCardWhere = {
  /** Outermost tenant bound — every board query is limited to this tenant. */
  tenantId?: string
  projectId?: string
  assigneeId?: string
  /** Staff-scoped: show tickets in these projects OR assigned to this user */
  staffProjectIds?: string[]
  staffUserId?: string
  /** Manager-scoped: only show tickets from these department IDs */
  allowedDeptIds?: string[]
  /** Cross-access-only: restrict to projects this user is a member of */
  crossAccessUserId?: string
  /** When set with crossAccessUserId, limit to this department's projects */
  crossAccessDeptId?: string
  /** Scope logged-time display to this user's entries */
  timeForUserId?: string
  skip?: number
  take?: number
  // Server-side filter params
  search?: string
  statusIn?: string[]
  priorityIn?: string[]
  projectIdIn?: string[]
  assigneeIdIn?: string[]
  moduleIdIn?: string[]
  labelsIn?: string[]
  dateFrom?: Date
  dateTo?: Date
  /** Inclusive range against any assignee's personal target date (TicketEstimate.targetDate). */
  targetDateFrom?: Date
  targetDateTo?: Date
  sortKey?: string
  unassignedOnly?: boolean
  /** "intake" = only tickets created via an intake form, "manual" = only tickets without one */
  source?: "intake" | "manual"
  /**
   * Draft visibility:
   * - undefined/false (default): exclude drafts from boards and normal lists
   * - true: only drafts (combine with creatorId or admin dept scope at the call site)
   */
  draftsOnly?: boolean
  /** When listing drafts for a non-admin, restrict to this creator */
  draftCreatorId?: string
}

const PRIORITY_UI_TO_DB: Record<string, string> = {
  urgent: "Urgent",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

function buildOrderBy(sortKey?: string) {
  switch (sortKey) {
    case "created":  return [{ createdAt: "desc" as const }]
    case "title":    return [{ title: "asc" as const }]
    case "due":      return [{ dueDate: "asc" as const }, { createdAt: "desc" as const }]
    case "status":   return [{ status: "asc" as const }, { createdAt: "desc" as const }]
    case "project":  return [{ project: { name: "asc" as const } }, { createdAt: "desc" as const }]
    case "updated":  return [{ updatedAt: "desc" as const }]
    // "priority" and undefined (board/timeline/project callers) both use the original default
    default:         return [{ priority: "desc" as const }, { createdAt: "desc" as const }]
  }
}

function buildTicketWhere(where: Omit<BoardCardWhere, "skip" | "take" | "timeForUserId" | "sortKey">) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const and: any[] = [{ deletedAt: null, parentId: null }]

  // Outermost tenant bound — applied to every board query regardless of the
  // dept/project/staff sub-scope below.
  if (where.tenantId) {
    and.push({ tenantId: where.tenantId })
  }

  if (where.draftsOnly) {
    and.push({ isDraft: true })
    if (where.draftCreatorId) {
      and.push({ creatorId: where.draftCreatorId })
    }
  } else {
    and.push({ isDraft: false })
  }

  // ── Access scope ────────────────────────────────────────────────────────────
  if (where.projectId) {
    and.push({ projectId: where.projectId })
  }
  if (where.assigneeId) {
    and.push({
      OR: [
        { assigneeId: where.assigneeId },
        { assignees: { some: { userId: where.assigneeId } } },
        { qaAssignees: { some: { userId: where.assigneeId } } },
      ],
    })
  }
  if (where.staffProjectIds && where.staffUserId) {
    and.push({
      OR: [
        { projectId: { in: where.staffProjectIds } },
        { assigneeId: where.staffUserId },
        { qaAssignees: { some: { userId: where.staffUserId } } },
      ],
    })
  }
  if (where.crossAccessUserId) {
    and.push({
      project: where.crossAccessDeptId
        ? {
            members: { some: { userId: where.crossAccessUserId } },
            OR: [
              { departmentId: where.crossAccessDeptId },
              { subDepartment: { departmentId: where.crossAccessDeptId } },
            ],
          }
        : { members: { some: { userId: where.crossAccessUserId } } },
    })
  } else if (where.allowedDeptIds) {
    and.push({ subDepartment: { departmentId: { in: where.allowedDeptIds } } })
  }

  // ── Filter params ───────────────────────────────────────────────────────────
  if (where.search) {
    const humanIdMatch = where.search.match(/^([A-Za-z]+)-(\d+)$/i)
    and.push({
      OR: [
        { title: { contains: where.search, mode: "insensitive" } },
        ...(humanIdMatch
          ? [{
              subDepartment: { prefix: { equals: humanIdMatch[1], mode: "insensitive" } },
              ticketNumber: parseInt(humanIdMatch[2], 10),
            }]
          : []),
      ],
    })
  }

  if (where.statusIn?.length) {
    and.push({ status: { in: where.statusIn } })
  }

  if (where.priorityIn?.length) {
    const dbPriorities = where.priorityIn.map((p) => PRIORITY_UI_TO_DB[p]).filter(Boolean)
    if (dbPriorities.length) and.push({ priority: { in: dbPriorities } })
  }

  if (where.projectIdIn?.length) {
    and.push({ projectId: { in: where.projectIdIn } })
  }

  if (where.assigneeIdIn?.length) {
    and.push({
      OR: [
        { assigneeId: { in: where.assigneeIdIn } },
        { assignees: { some: { userId: { in: where.assigneeIdIn } } } },
        { qaAssignees: { some: { userId: { in: where.assigneeIdIn } } } },
      ],
    })
  }

  if (where.moduleIdIn?.length) {
    and.push({ moduleId: { in: where.moduleIdIn } })
  }

  if (where.labelsIn?.length) {
    and.push({ labels: { hasSome: where.labelsIn } })
  }

  if (where.unassignedOnly) {
    and.push({ assigneeId: null, assignees: { none: {} } })
  }

  if (where.source === "intake") {
    and.push({ intake: { isNot: null } })
  } else if (where.source === "manual") {
    and.push({ intake: null })
  }

  if (where.dateFrom || where.dateTo) {
    and.push({
      createdAt: {
        ...(where.dateFrom ? { gte: where.dateFrom } : {}),
        ...(where.dateTo ? { lte: where.dateTo } : {}),
      },
    })
  }

  if (where.targetDateFrom || where.targetDateTo) {
    and.push({
      estimates: {
        some: {
          targetDate: {
            ...(where.targetDateFrom ? { gte: where.targetDateFrom } : {}),
            ...(where.targetDateTo ? { lte: where.targetDateTo } : {}),
          },
        },
      },
    })
  }

  return { AND: and }
}

export async function countBoardCards(where: Omit<BoardCardWhere, "skip" | "take" | "timeForUserId" | "sortKey"> = {}): Promise<number> {
  return prisma.ticket.count({ where: buildTicketWhere(where) })
}

export async function getBoardCards(where: BoardCardWhere = {}): Promise<BoardCardData[]> {
  const tickets = await prisma.ticket.findMany({
    where: buildTicketWhere(where),
    include: ticketInclude,
    orderBy: buildOrderBy(where.sortKey),
    ...(where.skip !== undefined ? { skip: where.skip } : {}),
    ...(where.take !== undefined ? { take: where.take } : {}),
  })
  const timeForUserId = where.timeForUserId ?? where.assigneeId ?? where.staffUserId
  const subDepartmentIds = [...new Set(tickets.map((t) => t.subDepartment.id))]
  const [{ totalMap, userMap }, completeStatuses] = await Promise.all([
    buildTimeMaps(tickets, timeForUserId),
    subDepartmentIds.length > 0
      ? prisma.subDepartmentStatus.findMany({
          where: { subDepartmentId: { in: subDepartmentIds }, isComplete: true },
          select: { subDepartmentId: true, label: true },
        })
      : Promise.resolve([]),
  ])
  const completeBySubDepartment = new Map<string, Set<string>>()
  for (const s of completeStatuses) {
    const set = completeBySubDepartment.get(s.subDepartmentId) ?? new Set<string>()
    set.add(s.label)
    completeBySubDepartment.set(s.subDepartmentId, set)
  }

  return tickets.map((t) => toBoardCard(t, totalMap, userMap, completeBySubDepartment.get(t.subDepartment.id) ?? new Set()))
}

/**
 * Fetches tickets from the given teams whose status indicates "Review" or
 * "Pull Request" — used for the manager's My Tasks page so they can see
 * work from their teams that needs sign-off without leaving the page.
 */
export async function getSubDepartmentReviewCards(
  subDepartmentIds: string[],
  forUserId?: string,
): Promise<BoardCardData[]> {
  if (subDepartmentIds.length === 0) return []
  const tickets = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      isDraft: false,
      parentId: null,
      subDepartmentId: { in: subDepartmentIds },
      OR: [
        { status: { contains: "review", mode: "insensitive" } },
        { status: { contains: "pull request", mode: "insensitive" } },
        { status: { equals: "PR", mode: "insensitive" } },
      ],
    },
    include: ticketInclude,
    orderBy: [{ updatedAt: "desc" }],
  })
  const [{ totalMap, userMap }, completeStatuses] = await Promise.all([
    buildTimeMaps(tickets, forUserId),
    prisma.subDepartmentStatus.findMany({
      where: { subDepartmentId: { in: subDepartmentIds }, isComplete: true },
      select: { subDepartmentId: true, label: true },
    }),
  ])
  const completeBySubDepartment = new Map<string, Set<string>>()
  for (const s of completeStatuses) {
    const set = completeBySubDepartment.get(s.subDepartmentId) ?? new Set<string>()
    set.add(s.label)
    completeBySubDepartment.set(s.subDepartmentId, set)
  }

  return tickets.map((t) => toBoardCard(t, totalMap, userMap, completeBySubDepartment.get(t.subDepartment.id) ?? new Set()))
}

export async function getSubDepartmentStatuses(subDepartmentId: string | null | undefined): Promise<SubDepartmentStatusConfig[]> {
  if (!subDepartmentId) return DEFAULT_STATUSES
  const statuses = await prisma.subDepartmentStatus.findMany({
    where: { subDepartmentId },
    orderBy: { order: "asc" },
    select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })
  return statuses.length > 0 ? statuses : DEFAULT_STATUSES
}

export async function getSubDepartmentStatusesForSubDepartmentIds(
  subDepartmentIds: string[],
): Promise<Map<string, SubDepartmentStatusConfig[]>> {
  if (subDepartmentIds.length === 0) return new Map()
  const rows = await prisma.subDepartmentStatus.findMany({
    where: { subDepartmentId: { in: subDepartmentIds } },
    orderBy: { order: "asc" },
    select: { id: true, subDepartmentId: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })
  const map = new Map<string, SubDepartmentStatusConfig[]>()
  for (const row of rows) {
    const arr = map.get(row.subDepartmentId) ?? []
    arr.push({ id: row.id, label: row.label, color: row.color, order: row.order, isComplete: row.isComplete, allowedLabels: row.allowedLabels })
    map.set(row.subDepartmentId, arr)
  }
  return map
}

export async function getSubDepartmentBoardGroups(
  cards: BoardCardData[],
  memberSubDepartmentIds: string[] = [],
): Promise<SubDepartmentBoardGroup[]> {
  const bySubDepartment = new Map<string, BoardCardData[]>()
  for (const card of cards) {
    const list = bySubDepartment.get(card.subDepartmentId) ?? []
    list.push(card)
    bySubDepartment.set(card.subDepartmentId, list)
  }

  // Fetch all team metadata and statuses in two batched queries (no per-team round trips)
  const allSubDepartmentIds = [...new Set([...bySubDepartment.keys(), ...memberSubDepartmentIds])]
  const [subDepartmentMeta, statusMap] = await Promise.all([
    prisma.subDepartment.findMany({
      where: { id: { in: allSubDepartmentIds } },
      select: { id: true, name: true },
    }),
    getSubDepartmentStatusesForSubDepartmentIds(allSubDepartmentIds),
  ])
  const subDepartmentMetaMap = new Map(subDepartmentMeta.map((t) => [t.id, t]))

  // Ensure the user's own teams always appear, even with 0 cards
  for (const id of memberSubDepartmentIds) {
    if (!bySubDepartment.has(id)) bySubDepartment.set(id, [])
  }

  const groups = [...bySubDepartment.entries()].map(([subDepartmentId, subDepartmentCards]) => {
    const meta = subDepartmentMetaMap.get(subDepartmentId)
    const subDepartmentName = subDepartmentCards[0]?.subDepartment ?? meta?.name ?? subDepartmentId
    const statuses = statusMap.get(subDepartmentId)
    return {
      subDepartmentId,
      subDepartmentName,
      cards: subDepartmentCards,
      statuses: statuses && statuses.length > 0 ? statuses : DEFAULT_STATUSES,
    }
  })

  // Sort by CUID (time-ordered) so the first-created team is always first
  return groups.sort((a, b) => a.subDepartmentId.localeCompare(b.subDepartmentId))
}
