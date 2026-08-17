import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canReadTeamData } from "@/lib/dept-scope"
import { canManageTeam } from "@/lib/team-manage"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await canReadTeamData(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: id },
    orderBy: { order: "asc" },
    select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })
  return NextResponse.json(statuses)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await canManageTeam(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const { label, color, allowedLabels } = body as { label?: string; color?: string; allowedLabels?: string[] }

  if (!label?.trim()) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 })
  }
  if (allowedLabels !== undefined && (!Array.isArray(allowedLabels) || !allowedLabels.every((l) => typeof l === "string"))) {
    return NextResponse.json({ error: "allowedLabels must be an array of strings" }, { status: 400 })
  }

  const existing = await prisma.teamStatus.findMany({
    where: { teamId: id },
    orderBy: { order: "desc" },
    take: 1,
    select: { order: true },
  })
  const nextOrder = existing.length > 0 ? existing[0].order + 1 : 0

  const status = await prisma.teamStatus.create({
    data: {
      teamId: id,
      label: label.trim(),
      color: color ?? "#94a3b8",
      order: nextOrder,
      allowedLabels: allowedLabels?.map((l) => l.trim()).filter(Boolean) ?? [],
    },
    select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })

  return NextResponse.json(status, { status: 201 })
}

// Bulk reorder: body = { order: string[] }  (array of status IDs in new order)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: teamId } = await params
  if (!(await canManageTeam(profile, teamId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const { order } = body as { order?: string[] }

  if (!Array.isArray(order)) {
    return NextResponse.json({ error: "order must be an array of status IDs" }, { status: 400 })
  }

  await prisma.$transaction(
    order.map((statusId, idx) =>
      prisma.teamStatus.updateMany({
        where: { id: statusId, teamId },
        data: { order: idx },
      })
    )
  )

  const updated = await prisma.teamStatus.findMany({
    where: { teamId },
    orderBy: { order: "asc" },
    select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })
  return NextResponse.json(updated)
}
