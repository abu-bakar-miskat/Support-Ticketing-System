import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import {
  projectInScope,
  resolveSprintListWhere,
  ticketsInScope,
} from "@/lib/dept-scope"
import { parseStartDatePayload, parseDueDatePayload } from "@/lib/ticket-datetime"

export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() || null

  const scopeWhere = await resolveSprintListWhere(profile)
  const where = projectId ? { AND: [scopeWhere, { projectId }] } : scopeWhere

  const sprints = await prisma.sprint.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: {
      tickets: {
        where: { deletedAt: null },
        select: { status: true, storyPoints: true, subDepartmentId: true },
      },
      project: {
        select: { id: true, name: true, color: true },
      },
    },
  })

  // Resolve isComplete per ticket using TeamStatus
  const allSubDepartmentIds = [...new Set(sprints.flatMap((s) => s.tickets.map((t) => t.subDepartmentId)))]
  const completeStatuses = allSubDepartmentIds.length
    ? await prisma.subDepartmentStatus.findMany({
        where: { subDepartmentId: { in: allSubDepartmentIds }, isComplete: true },
        select: { subDepartmentId: true, label: true },
      })
    : []
  const completeMap = new Map<string, Set<string>>()
  for (const cs of completeStatuses) {
    if (!completeMap.has(cs.subDepartmentId)) completeMap.set(cs.subDepartmentId, new Set())
    completeMap.get(cs.subDepartmentId)!.add(cs.label)
  }

  const result = sprints.map((sprint) => ({
    ...sprint,
    tickets: sprint.tickets.map(({ subDepartmentId, ...t }) => ({
      ...t,
      isDone: completeMap.get(subDepartmentId)?.has(t.status) ?? false,
    })),
  }))

  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const goal = (body.goal as string | undefined)?.trim() || null
  const startDate = body.startDate ? parseStartDatePayload(body.startDate as string) : null
  const endDate = body.endDate ? parseDueDatePayload(body.endDate as string) : null
  const pointsTarget =
    body.pointsTarget != null ? Number(body.pointsTarget) : null

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  if (!startDate || isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "startDate is required" }, { status: 400 })
  }
  if (!endDate || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "endDate is required" }, { status: 400 })
  }
  if (endDate <= startDate) {
    return NextResponse.json(
      { error: "endDate must be after startDate" },
      { status: 400 },
    )
  }
  if (pointsTarget !== null && (isNaN(pointsTarget) || pointsTarget < 0)) {
    return NextResponse.json(
      { error: "pointsTarget must be a non-negative number" },
      { status: 400 },
    )
  }

  const projectId = (body.projectId as string | undefined)?.trim() || null
  const ticketIds: string[] = Array.isArray(body.ticketIds) ? body.ticketIds : []

  if (!projectId) {
    return NextResponse.json({ error: "A project is required" }, { status: 400 })
  }
  if (!(await projectInScope(profile, projectId))) {
    return forbidden("That project isn't in your current department.")
  }
  if (!(await ticketsInScope(profile, ticketIds, projectId))) {
    return forbidden("One or more tickets are outside your department scope.")
  }

  try {
    const sprint = await prisma.$transaction(async (tx) => {
      const created = await tx.sprint.create({
        data: {
          name,
          goal,
          startDate,
          endDate,
          pointsTarget: pointsTarget !== null ? Math.round(pointsTarget) : null,
          createdById: profile!.id,
          projectId,
        },
      })
      if (ticketIds.length > 0) {
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds }, deletedAt: null },
          data: { sprintId: created.id },
        })
      }
      return created
    })

    return NextResponse.json(sprint, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[POST /api/sprints]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
