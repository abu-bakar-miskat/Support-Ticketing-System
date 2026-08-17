import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const board = await prisma.recruitmentBoard.findFirst({
    where: { id, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: {
      id: true,
      name: true,
      fields: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, type: true, options: true, order: true, hidden: true },
      },
      candidates: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, values: true, order: true, createdAt: true },
      },
    },
  })
  if (!board) return notFound("Board not found")
  return NextResponse.json(board)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const body = await request.json().catch(() => ({}))
  const data: { name?: string; archivedAt?: Date | null } = {}

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return badRequest("Board name is required")
    data.name = name
  }
  if (body.archived !== undefined) {
    data.archivedAt = body.archived === true ? new Date() : null
  }
  if (Object.keys(data).length === 0) return badRequest("Nothing to update")

  const existing = await prisma.recruitmentBoard.findFirst({
    where: { id, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!existing) return notFound("Board not found")

  const board = await prisma.recruitmentBoard.update({
    where: { id },
    data,
    select: { id: true, name: true, archivedAt: true },
  })
  return NextResponse.json({ id: board.id, name: board.name, archived: board.archivedAt !== null })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const existing = await prisma.recruitmentBoard.findFirst({
    where: { id, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!existing) return notFound("Board not found")

  await prisma.recruitmentBoard.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
