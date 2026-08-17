import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { projectInScope, sprintInScope, ticketsInScope } from "@/lib/dept-scope"
import { parseStartDatePayload, parseDueDatePayload } from "@/lib/ticket-datetime"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await sprintInScope(profile, id))) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      project: { select: { id: true, name: true, color: true } },
      tickets: {
        where: { deletedAt: null },
        orderBy: { ticketNumber: "asc" },
        select: {
          id: true,
          title: true,
          ticketNumber: true,
          status: true,
          priority: true,
          storyPoints: true,
          teamId: true,
          team: { select: { prefix: true } },
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      _count: { select: { tickets: true } },
    },
  })

  if (!sprint) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  // Stamp isDone on each ticket using TeamStatus.isComplete
  const teamIds = [...new Set(sprint.tickets.map((t) => t.teamId))]
  const completeStatuses = teamIds.length
    ? await prisma.teamStatus.findMany({
        where: { teamId: { in: teamIds }, isComplete: true },
        select: { teamId: true, label: true },
      })
    : []
  const completeMap = new Map<string, Set<string>>()
  for (const cs of completeStatuses) {
    if (!completeMap.has(cs.teamId)) completeMap.set(cs.teamId, new Set())
    completeMap.get(cs.teamId)!.add(cs.label)
  }

  const result = {
    ...sprint,
    tickets: sprint.tickets.map(({ teamId, ...t }) => ({
      ...t,
      isDone: completeMap.get(teamId)?.has(t.status) ?? false,
    })),
  }

  return NextResponse.json(result)
}

export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await sprintInScope(profile, id))) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const existing = await prisma.sprint.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const goal =
    "goal" in body ? ((body.goal as string | undefined)?.trim() || null) : undefined
  const startDate = body.startDate ? parseStartDatePayload(body.startDate as string) : undefined
  const endDate = body.endDate ? parseDueDatePayload(body.endDate as string) : undefined
  const pointsTarget =
    "pointsTarget" in body
      ? body.pointsTarget != null
        ? Math.round(Number(body.pointsTarget))
        : null
      : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
  }

  const resolvedStart = startDate ?? existing.startDate
  const resolvedEnd = endDate ?? existing.endDate
  if (resolvedEnd <= resolvedStart) {
    return NextResponse.json(
      { error: "endDate must be after startDate" },
      { status: 400 },
    )
  }

  const projectId =
    "projectId" in body
      ? ((body.projectId as string | undefined)?.trim() || null)
      : undefined

  const ticketIds: string[] | undefined = Array.isArray(body.ticketIds)
    ? (body.ticketIds as string[])
    : undefined

  if (projectId !== undefined && !projectId) {
    return NextResponse.json({ error: "A project is required" }, { status: 400 })
  }
  if (projectId && !(await projectInScope(profile, projectId))) {
    return NextResponse.json({ error: "Project not in current department" }, { status: 403 })
  }
  if (ticketIds && !(await ticketsInScope(profile, ticketIds, projectId ?? existing.projectId))) {
    return NextResponse.json({ error: "One or more tickets are outside department scope" }, { status: 403 })
  }

  const sprint = await prisma.$transaction(async (tx) => {
    const updated = await tx.sprint.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(goal !== undefined && { goal }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(pointsTarget !== undefined && { pointsTarget }),
        ...(projectId !== undefined && { projectId }),
      },
    })
    if (ticketIds !== undefined) {
      // Detach tickets that were in this sprint but aren't in the new selection
      await tx.ticket.updateMany({
        where: { sprintId: id, id: { notIn: ticketIds } },
        data: { sprintId: null },
      })
      // Attach the new selection
      if (ticketIds.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds }, deletedAt: null },
          data: { sprintId: id },
        })
      }
    }
    return updated
  })

  return NextResponse.json(sprint)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  if (!(await sprintInScope(profile, id))) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  const existing = await prisma.sprint.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  }

  if (existing.status === "active") {
    return NextResponse.json(
      { error: "Cannot delete an active sprint. Complete it first." },
      { status: 409 },
    )
  }

  // Detach tickets from the sprint before deleting
  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { sprintId: id }, data: { sprintId: null } }),
    prisma.sprint.delete({ where: { id } }),
  ])

  return new NextResponse(null, { status: 204 })
}
