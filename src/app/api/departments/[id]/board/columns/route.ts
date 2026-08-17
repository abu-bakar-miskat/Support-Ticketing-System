import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { isStatusType } from "@/lib/board-columns"

const COLUMN_SELECT = {
  id: true,
  label: true,
  color: true,
  statusType: true,
  order: true,
} as const

/** GET /api/departments/:id/board/columns — the department's board, in order. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const columns = await prisma.boardColumn.findMany({
    where: { departmentId: id },
    orderBy: { order: "asc" },
    select: COLUMN_SELECT,
  })
  return NextResponse.json(columns)
}

/**
 * POST /api/departments/:id/board/columns — add a column. Adding REQUIRES a
 * status_type (AC-3); the label is free text. status_type is fixed at creation
 * and never editable, so it stays immutable once the column holds tickets (DAT-02).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const label = (body.label as string | undefined)?.trim()
  const color = (body.color as string | undefined)?.trim()
  const statusType = body.statusType as unknown

  if (!label) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 })
  }
  if (!isStatusType(statusType)) {
    return NextResponse.json(
      { error: "statusType is required and must be one of OPEN, PAUSED, ESCALATED, RESOLVED" },
      { status: 400 },
    )
  }

  const dept = await prisma.department.findUnique({
    where: { id },
    select: { tenantId: true },
  })
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  const last = await prisma.boardColumn.findFirst({
    where: { departmentId: id },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  try {
    const column = await prisma.boardColumn.create({
      data: {
        tenantId: dept.tenantId,
        departmentId: id,
        label,
        color: color || "#94a3b8",
        statusType,
        order: nextOrder,
      },
      select: COLUMN_SELECT,
    })
    return NextResponse.json(column, { status: 201 })
  } catch (e) {
    // Unique ([departmentId, label]) violation → duplicate column label.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A column with that name already exists" }, { status: 409 })
    }
    throw e
  }
}

/**
 * PATCH /api/departments/:id/board/columns — bulk reorder.
 * Body: { order: string[] } — column ids in the new order. Rejects ids that
 * don't belong to this department's board.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const order = body.order as unknown
  if (!Array.isArray(order) || !order.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "order must be an array of column ids" }, { status: 400 })
  }

  const owned = await prisma.boardColumn.findMany({
    where: { departmentId: id },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((c) => c.id))
  if (order.length !== ownedIds.size || !order.every((cid) => ownedIds.has(cid as string))) {
    return NextResponse.json(
      { error: "order must list exactly the columns of this board" },
      { status: 400 },
    )
  }

  await prisma.$transaction(
    (order as string[]).map((cid, index) =>
      prisma.boardColumn.update({ where: { id: cid }, data: { order: index } }),
    ),
  )
  return NextResponse.json({ ok: true })
}
