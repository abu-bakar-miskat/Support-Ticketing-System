import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageTeam } from "@/lib/team-manage"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, statusId } = await params
  if (!(await canManageTeam(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const { label, color, order, isComplete, allowedLabels } = body as {
    label?: string
    color?: string
    order?: number
    isComplete?: boolean
    allowedLabels?: string[]
  }

  if (allowedLabels !== undefined && (!Array.isArray(allowedLabels) || !allowedLabels.every((l) => typeof l === "string"))) {
    return NextResponse.json({ error: "allowedLabels must be an array of strings" }, { status: 400 })
  }

  const existing = await prisma.teamStatus.findFirst({
    where: { id: statusId, teamId: id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.teamStatus.update({
    where: { id: statusId },
    data: {
      ...(label?.trim() ? { label: label.trim() } : {}),
      ...(color ? { color } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(isComplete !== undefined ? { isComplete } : {}),
      ...(allowedLabels !== undefined ? { allowedLabels: allowedLabels.map((l) => l.trim()).filter(Boolean) } : {}),
    },
    select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, statusId } = await params
  if (!(await canManageTeam(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.teamStatus.findFirst({
    where: { id: statusId, teamId: id },
    select: { id: true, label: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Block delete if any tickets still use this status
  const ticketCount = await prisma.ticket.count({
    where: { teamId: id, status: existing.label, deletedAt: null },
  })
  if (ticketCount > 0) {
    return NextResponse.json(
      { error: `${ticketCount} ticket(s) still use this status. Move them first.` },
      { status: 409 },
    )
  }

  await prisma.teamStatus.delete({ where: { id: statusId } })
  return new NextResponse(null, { status: 204 })
}
