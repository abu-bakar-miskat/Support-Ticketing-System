import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { RECRUITMENT_FIELD_TYPES, isSelectType, validateOptionsInput } from "@/lib/recruitment"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId, fieldId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const field = await prisma.recruitmentField.findFirst({
    where: { id: fieldId, boardId, board: recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true, type: true },
  })
  if (!field) return notFound("Field not found")

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return badRequest("Field name cannot be empty")
    data.name = name
  }

  let nextType = field.type
  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !RECRUITMENT_FIELD_TYPES.includes(body.type as RecruitmentFieldType)) {
      return badRequest("Unknown field type")
    }
    nextType = body.type as RecruitmentFieldType
    data.type = nextType
  }

  if (body.options !== undefined) {
    if (!isSelectType(nextType)) return badRequest("Only select fields have options")
    const res = validateOptionsInput(body.options)
    if (!res.ok) return badRequest(res.message)
    data.options = res.options
  }

  if (body.hidden !== undefined) data.hidden = body.hidden === true
  if (body.order !== undefined) {
    const order = Number(body.order)
    if (!Number.isInteger(order) || order < 0) return badRequest("order must be a non-negative integer")
    data.order = order
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update")

  const updated = await prisma.recruitmentField.update({
    where: { id: fieldId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    select: { id: true, name: true, type: true, options: true, order: true, hidden: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId, fieldId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const field = await prisma.recruitmentField.findFirst({
    where: { id: fieldId, boardId, board: recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!field) return notFound("Field not found")

  await prisma.recruitmentField.delete({ where: { id: fieldId } })
  return NextResponse.json({ ok: true })
}
