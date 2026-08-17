import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { RECRUITMENT_FIELD_TYPES, isSelectType, validateOptionsInput } from "@/lib/recruitment"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const board = await prisma.recruitmentBoard.findFirst({
    where: { id: boardId, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!board) return notFound("Board not found")

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return badRequest("Field name is required")

  const type: RecruitmentFieldType =
    typeof body.type === "string" && RECRUITMENT_FIELD_TYPES.includes(body.type as RecruitmentFieldType)
      ? (body.type as RecruitmentFieldType)
      : "text"

  let options: unknown = undefined
  if (isSelectType(type)) {
    const res = validateOptionsInput(body.options ?? [])
    if (!res.ok) return badRequest(res.message)
    options = res.options
  }

  const last = await prisma.recruitmentField.findFirst({
    where: { boardId },
    orderBy: { order: "desc" },
    select: { order: true },
  })

  const field = await prisma.recruitmentField.create({
    data: {
      boardId,
      name,
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: options as any,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true, name: true, type: true, options: true, order: true, hidden: true },
  })
  return NextResponse.json(field, { status: 201 })
}

/** Bulk reorder: { orderedIds } must list every field id on the board exactly once. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const board = await prisma.recruitmentBoard.findFirst({
    where: { id: boardId, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true, fields: { select: { id: true } } },
  })
  if (!board) return notFound("Board not found")

  const body = await request.json().catch(() => ({}))
  const orderedIds: unknown = body.orderedIds
  if (!Array.isArray(orderedIds) || !orderedIds.every((v): v is string => typeof v === "string")) {
    return badRequest("orderedIds must be an array of field ids")
  }
  const existing = new Set(board.fields.map((f) => f.id))
  const unique = new Set(orderedIds)
  if (
    orderedIds.length !== existing.size ||
    unique.size !== orderedIds.length ||
    orderedIds.some((fid) => !existing.has(fid))
  ) {
    return badRequest("orderedIds must contain every field id on this board exactly once")
  }

  await prisma.$transaction(
    orderedIds.map((fid, i) =>
      prisma.recruitmentField.update({ where: { id: fid }, data: { order: i } }),
    ),
  )
  return NextResponse.json({ ok: true })
}
