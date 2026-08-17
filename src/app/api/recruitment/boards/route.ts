import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest } from "@/lib/api-response"
import { DEFAULT_BOARD_FIELDS } from "@/lib/recruitment"

export async function GET() {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const activeDeptId = await resolveActiveDeptId(profile)
  const boards = await prisma.recruitmentBoard.findMany({
    where: recruitmentBoardWhere(profile, activeDeptId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      archivedAt: true,
      _count: { select: { candidates: true } },
    },
  })
  return NextResponse.json(
    boards.map((b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      archived: b.archivedAt !== null,
      candidateCount: b._count.candidates,
    })),
  )
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return badRequest("Board name is required")

  const activeDeptId = await resolveActiveDeptId(profile)
  if (!activeDeptId) return badRequest("Select a department before creating a board")

  const board = await prisma.recruitmentBoard.create({
    data: {
      name,
      createdById: profile.id,
      departmentId: activeDeptId,
      fields: {
        create: DEFAULT_BOARD_FIELDS.map((f, i) => ({
          name: f.name,
          type: f.type,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options: (f.options ?? undefined) as any,
          order: i,
        })),
      },
    },
    select: { id: true, name: true },
  })
  return NextResponse.json(board, { status: 201 })
}
