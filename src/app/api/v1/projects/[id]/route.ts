import { NextRequest, NextResponse } from "next/server"
import { requireApiKey, runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import {
  resolveCurrentStage,
  resolveLifecycleStages,
  toLifecycleStageApi,
  toLifecycleStagesApi,
} from "@/lib/project-lifecycle"

const ASSIGNEE_SELECT = {
  select: {
    user: {
      select: { id: true, name: true, email: true, avatarUrl: true },
    },
  },
}

const SPRINT_MODULE_SELECT = {
  sprint: { select: { id: true, name: true } },
  module: { select: { id: true, name: true } },
}

const SUB_TICKET_SELECT = {
  where: { deletedAt: null as null },
  select: {
    id: true,
    ticketNumber: true,
    title: true,
    type: true,
    priority: true,
    status: true,
    startDate: true,
    dueDate: true,
    closedAt: true,
    createdAt: true,
    assignees: ASSIGNEE_SELECT,
    ...SPRINT_MODULE_SELECT,
  },
  orderBy: { ticketNumber: "asc" as const },
}

/**
 * GET /api/v1/projects/:id
 * Returns a project with all its tickets, assignees, dates, and sub-tickets.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireApiKey(req)
  if (error) return error

  return runWithApiKeyScope(ctx, async () => {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      description: true,
      projectStatus: true,
      projectUrl: true,
      guidelines: true,
      departmentId: true,
      lifecycleStages: true,
      pipelineStartedAt: true,
      developmentStartedAt: true,
      liveAt: true,
      subDepartment: { select: { id: true, name: true, departmentId: true } },
      members: {
        orderBy: { addedAt: "asc" },
        select: {
          addedAt: true,
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
      tickets: {
        where: { deletedAt: null, parentId: null },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          startDate: true,
          dueDate: true,
          closedAt: true,
          createdAt: true,
          assignees: ASSIGNEE_SELECT,
          ...SPRINT_MODULE_SELECT,
          subTickets: SUB_TICKET_SELECT,
        },
        orderBy: { ticketNumber: "asc" },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (ctx.departmentId) {
    const inDept =
      project.departmentId === ctx.departmentId ||
      project.subDepartment?.departmentId === ctx.departmentId
    if (!inDept) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
  }

  const formatAssignees = (assignees: typeof project.tickets[0]["assignees"]) =>
    assignees.map((a) => ({
      id: a.user.id,
      name: a.user.name,
      email: a.user.email,
      avatarUrl: a.user.avatarUrl ?? null,
    }))

  const stages = resolveLifecycleStages(project)
  const current = resolveCurrentStage(stages, project.projectStatus)

  return NextResponse.json({
    id: project.id,
    name: project.name,
    slug: project.slug,
    color: project.color,
    description: project.description,
    status: project.projectStatus,
    currentStage: current ? toLifecycleStageApi(current) : null,
    stages: toLifecycleStagesApi(stages),
    projectUrl: project.projectUrl,
    guidelines: project.guidelines,
    subDepartment: project.subDepartment ? { id: project.subDepartment.id, name: project.subDepartment.name } : null,
    members: project.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
      addedAt: m.addedAt,
    })),
    tickets: project.tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      startDate: t.startDate ?? null,
      dueDate: t.dueDate ?? null,
      closedAt: t.closedAt ?? null,
      createdAt: t.createdAt,
      assignees: formatAssignees(t.assignees),
      sprint: t.sprint ? { id: t.sprint.id, name: t.sprint.name } : null,
      module: t.module ? { id: t.module.id, name: t.module.name } : null,
      subTickets: t.subTickets.map((s) => ({
        id: s.id,
        ticketNumber: s.ticketNumber,
        title: s.title,
        type: s.type,
        priority: s.priority,
        status: s.status,
        startDate: s.startDate ?? null,
        dueDate: s.dueDate ?? null,
        closedAt: s.closedAt ?? null,
        createdAt: s.createdAt,
        assignees: formatAssignees(s.assignees),
        sprint: s.sprint ? { id: s.sprint.id, name: s.sprint.name } : null,
        module: s.module ? { id: s.module.id, name: s.module.name } : null,
      })),
    })),
  })
  })
}
