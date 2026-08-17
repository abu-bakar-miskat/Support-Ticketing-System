import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { normalizeValuesPatch, mergeValues } from "@/lib/recruitment"

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
    select: { id: true, fields: { select: { id: true, type: true, options: true } } },
  })
  if (!board) return notFound("Board not found")

  const body = await request.json().catch(() => ({}))
  let values: Record<string, unknown> = {}
  if (body.values !== undefined) {
    const res = normalizeValuesPatch(board.fields, body.values)
    if (!res.ok) return badRequest(res.message)
    values = mergeValues({}, res.values)
  }

  const last = await prisma.recruitmentCandidate.findFirst({
    where: { boardId },
    orderBy: { order: "desc" },
    select: { order: true },
  })

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      boardId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: values as any,
      order: (last?.order ?? -1) + 1,
      createdById: profile.id,
    },
    select: { id: true, values: true, order: true, createdAt: true },
  })
  return NextResponse.json(candidate, { status: 201 })
}
