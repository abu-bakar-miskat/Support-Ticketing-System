import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getProfileDeptScope, projectInScope } from "@/lib/dept-scope"
import { canAccessModulesArea } from "@/lib/module-permissions"
import { getSubDepartmentStatusesForSubDepartmentIds } from "@/lib/board-data"
import { DEFAULT_STATUSES } from "@/components/board/board-types"
import { parseEnabledBoardSubDepartmentIds } from "@/lib/project-boards"

type Params = { params: Promise<{ id: string }> }

const ticketSelect = {
  id: true,
  title: true,
  ticketNumber: true,
  status: true,
  priority: true,
  type: true,
  labels: true,
  storyPoints: true,
  parentId: true,
  createdAt: true,
  closedAt: true,
  subDepartmentId: true,
  subDepartment: { select: { prefix: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const

/** Modules-area data: every module with its tickets plus the Module 0 (unassigned) bucket. */
export async function GET(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const deptScope = await getProfileDeptScope(profile)
  if (!canAccessModulesArea(profile, deptScope?.activeDeptId ?? null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!(await projectInScope(profile, id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      moduleSystemEnabled: true,
      enabledBoardSubDepartmentIds: true,
      subDepartmentId: true,
    },
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const [modules, moduleZeroTickets] = await Promise.all([
    prisma.projectModule.findMany({
      where: { projectId: id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        tickets: {
          where: { deletedAt: null },
          orderBy: { ticketNumber: "asc" },
          select: ticketSelect,
        },
      },
    }),
    prisma.ticket.findMany({
      where: { projectId: id, moduleId: null, deletedAt: null },
      orderBy: { ticketNumber: "asc" },
      select: ticketSelect,
    }),
  ])

  const ticketSubDepartmentIds = [
    ...new Set([
      ...modules.flatMap((m) => m.tickets.map((t) => t.subDepartmentId)),
      ...moduleZeroTickets.map((t) => t.subDepartmentId),
    ]),
  ]
  const storedBoardSubDepartmentIds = parseEnabledBoardSubDepartmentIds(project.enabledBoardSubDepartmentIds)
  const statusSubDepartmentIds = [
    ...new Set([
      ...ticketSubDepartmentIds,
      ...(storedBoardSubDepartmentIds ?? []),
      ...(project.subDepartmentId ? [project.subDepartmentId] : []),
    ]),
  ]

  // Stamp isDone + merge workflow columns across every team on the project
  const statusMap = await getSubDepartmentStatusesForSubDepartmentIds(statusSubDepartmentIds)
  const completeMap = new Map<string, Set<string>>()
  const seenLabels = new Set<string>()
  const statuses: { label: string; color: string }[] = []
  for (const subDepartmentId of statusSubDepartmentIds) {
    for (const s of statusMap.get(subDepartmentId) ?? []) {
      if (s.isComplete) {
        if (!completeMap.has(subDepartmentId)) completeMap.set(subDepartmentId, new Set())
        completeMap.get(subDepartmentId)!.add(s.label)
      }
      if (!seenLabels.has(s.label)) {
        seenLabels.add(s.label)
        statuses.push({ label: s.label, color: s.color })
      }
    }
  }
  if (statuses.length === 0) {
    for (const s of DEFAULT_STATUSES) {
      statuses.push({ label: s.label, color: s.color })
      seenLabels.add(s.label)
    }
  }

  // Keep orphan ticket statuses visible (e.g. renamed/deleted workflow labels)
  const allTickets = [
    ...modules.flatMap((m) => m.tickets),
    ...moduleZeroTickets,
  ]
  for (const t of allTickets) {
    if (!seenLabels.has(t.status)) {
      seenLabels.add(t.status)
      statuses.push({ label: t.status, color: "#94a3b8" })
    }
  }

  const stamp = <T extends { subDepartmentId: string; status: string }>({ subDepartmentId, ...t }: T) => ({
    ...t,
    isDone: completeMap.get(subDepartmentId)?.has(t.status) ?? false,
  })

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      moduleSystemEnabled: project.moduleSystemEnabled,
    },
    statuses,
    modules: modules.map((m) => ({ ...m, tickets: m.tickets.map(stamp) })),
    moduleZero: { tickets: moduleZeroTickets.map(stamp) },
  })
}
