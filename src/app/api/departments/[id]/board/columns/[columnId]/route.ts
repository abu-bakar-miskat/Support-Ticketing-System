import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"

const COLUMN_SELECT = {
  id: true,
  label: true,
  color: true,
  statusType: true,
  order: true,
} as const

async function loadColumn(departmentId: string, columnId: string) {
  return prisma.boardColumn.findFirst({
    where: { id: columnId, departmentId },
    select: { id: true, statusType: true },
  })
}

/**
 * PATCH /api/departments/:id/board/columns/:columnId — rename / recolor.
 * Renaming NEVER changes status_type (DAT-02): status_type is not editable, and
 * a request that tries to change it is rejected.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, columnId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const column = await loadColumn(id, columnId)
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  if (body.statusType !== undefined && body.statusType !== column.statusType) {
    return NextResponse.json(
      { error: "status_type is immutable; it cannot be changed after creation" },
      { status: 400 },
    )
  }

  const data: { label?: string; color?: string } = {}
  if (body.label !== undefined) {
    const label = (body.label as string)?.trim()
    if (!label) return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 })
    data.label = label
  }
  if (body.color !== undefined) {
    const color = (body.color as string)?.trim()
    if (color) data.color = color
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  try {
    const updated = await prisma.boardColumn.update({
      where: { id: columnId },
      data,
      select: COLUMN_SELECT,
    })
    return NextResponse.json(updated)
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A column with that name already exists" }, { status: 409 })
    }
    throw e
  }
}

/**
 * DELETE /api/departments/:id/board/columns/:columnId — delete a column.
 * If the column holds tickets, deletion is blocked unless a destination column
 * is supplied (AC-3): its tickets are moved there first, then the column is
 * removed. Pass ?to=<columnId> (or { destinationColumnId } in the body).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, columnId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const column = await loadColumn(id, columnId)
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 })
  }

  const ticketCount = await prisma.ticket.count({ where: { boardColumnId: columnId } })

  const body = await request.json().catch(() => ({}))
  const destinationColumnId =
    request.nextUrl.searchParams.get("to") ??
    (typeof body.destinationColumnId === "string" ? body.destinationColumnId : null)

  if (ticketCount > 0) {
    if (!destinationColumnId) {
      return NextResponse.json(
        { error: "Column holds tickets; choose a destination column to move them to", ticketCount },
        { status: 409 },
      )
    }
    if (destinationColumnId === columnId) {
      return NextResponse.json({ error: "Destination must be a different column" }, { status: 400 })
    }
    const destination = await loadColumn(id, destinationColumnId)
    if (!destination) {
      return NextResponse.json({ error: "Destination column not found on this board" }, { status: 400 })
    }
    await prisma.$transaction([
      prisma.ticket.updateMany({
        where: { boardColumnId: columnId },
        data: { boardColumnId: destinationColumnId },
      }),
      prisma.boardColumn.delete({ where: { id: columnId } }),
    ])
    return NextResponse.json({ ok: true, moved: ticketCount, to: destinationColumnId })
  }

  await prisma.boardColumn.delete({ where: { id: columnId } })
  return NextResponse.json({ ok: true, moved: 0 })
}
