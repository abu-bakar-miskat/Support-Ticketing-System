import { NextRequest, NextResponse } from "next/server"
import { requireApiKey } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"

/**
 * GET /api/v1/tickets/:id
 * Returns full ticket detail, scoped to the API key's department.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireApiKey(req)
  if (error) return error

  const { id } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      type: true,
      labels: true,
      storyPoints: true,
      estimatedTime: true,
      startDate: true,
      dueDate: true,
      closedAt: true,
      cycleTime: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      team: { select: { id: true, name: true, prefix: true, departmentId: true } },
      project: { select: { id: true, name: true, slug: true, color: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true } },
      sprint: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
    },
  })

  if (!ticket || ticket.deletedAt !== null) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  // Enforce department scope
  if (ctx.departmentId && ticket.team.departmentId !== ctx.departmentId) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: ticket.id,
    ticketId: `${ticket.team.prefix}-${ticket.ticketNumber}`,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    type: ticket.type,
    labels: ticket.labels,
    storyPoints: ticket.storyPoints,
    estimatedTime: ticket.estimatedTime,
    startDate: ticket.startDate,
    dueDate: ticket.dueDate,
    closedAt: ticket.closedAt,
    cycleTimeDays: ticket.cycleTime != null ? +(ticket.cycleTime / 86_400).toFixed(2) : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    team: { id: ticket.team.id, name: ticket.team.name },
    project: ticket.project
      ? { id: ticket.project.id, name: ticket.project.name, slug: ticket.project.slug }
      : null,
    assignee: ticket.assignee
      ? { id: ticket.assignee.id, name: ticket.assignee.name, avatarUrl: ticket.assignee.avatarUrl }
      : null,
    creator: { id: ticket.creator.id, name: ticket.creator.name },
    sprint: ticket.sprint ? { id: ticket.sprint.id, name: ticket.sprint.name } : null,
    module: ticket.module ? { id: ticket.module.id, name: ticket.module.name } : null,
  })
}
