import { NextRequest, NextResponse } from "next/server"
import { requireApiKey } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"

/**
 * GET /api/v1/projects/:id/tickets
 * Returns all tickets for a project, scoped to the API key's department.
 * Query params: status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireApiKey(req)
  if (error) return error

  const { id: projectId } = await params
  const statusFilter = req.nextUrl.searchParams.get("status")

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { departmentId: true, team: { select: { departmentId: true } } },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (ctx.departmentId) {
    const inDept =
      project.departmentId === ctx.departmentId ||
      project.team?.departmentId === ctx.departmentId
    if (!inDept) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { ticketNumber: "asc" },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      labels: true,
      storyPoints: true,
      startDate: true,
      dueDate: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      team: { select: { prefix: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      sprint: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    data: tickets.map((t) => ({
      id: t.id,
      ticketId: `${t.team.prefix}-${t.ticketNumber}`,
      title: t.title,
      status: t.status,
      priority: t.priority,
      type: t.type,
      labels: t.labels,
      storyPoints: t.storyPoints,
      startDate: t.startDate,
      dueDate: t.dueDate,
      closedAt: t.closedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignee: t.assignee
        ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
        : null,
      sprint: t.sprint ? { id: t.sprint.id, name: t.sprint.name } : null,
      module: t.module ? { id: t.module.id, name: t.module.name } : null,
    })),
  })
}
