import { NextRequest, NextResponse, after } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { isStatusCategory } from "@/lib/status-category"
import { canManageSubDepartment } from "@/lib/sub-department-manage"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, statusId } = await params
  if (!(await canManageSubDepartment(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const { label, color, order, category, isComplete, allowedLabels } = body as {
    label?: string
    color?: string
    order?: number
    category?: unknown
    isComplete?: boolean
    allowedLabels?: string[]
  }

  if (category !== undefined && !isStatusCategory(category)) {
    return NextResponse.json({ error: "Invalid status category" }, { status: 400 })
  }
  if (label !== undefined && (typeof label !== "string" || !label.trim())) {
    return NextResponse.json({ error: "Status name cannot be empty" }, { status: 400 })
  }
  if (isComplete !== undefined && typeof isComplete !== "boolean") {
    return NextResponse.json({ error: "isComplete must be a boolean" }, { status: 400 })
  }
  if (isStatusCategory(category) && isComplete !== undefined && isComplete !== (category === "COMPLETE")) {
    return NextResponse.json({ error: "Completion is determined by the category" }, { status: 400 })
  }

  if (allowedLabels !== undefined && (!Array.isArray(allowedLabels) || !allowedLabels.every((l) => typeof l === "string"))) {
    return NextResponse.json({ error: "allowedLabels must be an array of strings" }, { status: 400 })
  }

  const existing = await prisma.subDepartmentStatus.findFirst({
    where: { id: statusId, subDepartmentId: id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (isComplete !== undefined && category === undefined) {
    return NextResponse.json({ error: "Choose a category instead of setting isComplete" }, { status: 400 })
  }
  const nextCategory = isStatusCategory(category) ? category : existing.category
  const updated = await prisma.$transaction(async (tx) => {
    // Reclassifying populated statuses across the completion boundary would
    // silently close/reopen tickets. Require explicit ticket moves instead.
    if ((nextCategory === "COMPLETE") !== (existing.category === "COMPLETE")) {
      const count = await tx.ticket.count({
        where: { subDepartmentId: id, status: existing.label, deletedAt: null },
      })
      if (count > 0) return null
    }
    const result = await tx.subDepartmentStatus.update({
      where: { id: statusId },
      data: {
        ...(label?.trim() ? { label: label.trim() } : {}),
        ...(color ? { color } : {}),
        ...(order !== undefined ? { order } : {}),
        category: nextCategory,
        ...(allowedLabels !== undefined ? { allowedLabels: allowedLabels.map((l) => l.trim()).filter(Boolean) } : {}),
      },
      select: { id: true, label: true, color: true, order: true, category: true, isComplete: true, allowedLabels: true },
    })
    if (result.label !== existing.label) {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${profile.id}, true)`
      await tx.ticket.updateMany({
        where: { subDepartmentId: id, status: existing.label },
        data: { status: result.label },
      })
    }
    return result
  })
  if (!updated) {
    return NextResponse.json({ error: "Move tickets out of this status before changing it into or out of Complete" }, { status: 409 })
  }

  if (existing.category === "IN_PROGRESS" && updated.category !== "IN_PROGRESS") {
    after(async () => {
      const tickets = await prisma.ticket.findMany({
        where: { subDepartmentId: id, status: updated.label, deletedAt: null, timeEntries: { some: { endedAt: null } } },
        select: { id: true },
      })
      for (const ticket of tickets) await stopRunningTimersOnStatusChange(ticket.id, updated.label, updated.category)
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, statusId } = await params
  if (!(await canManageSubDepartment(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.subDepartmentStatus.findFirst({
    where: { id: statusId, subDepartmentId: id },
    select: { id: true, label: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Block delete if any tickets still use this status
  const ticketCount = await prisma.ticket.count({
    where: { subDepartmentId: id, status: existing.label, deletedAt: null },
  })
  if (ticketCount > 0) {
    return NextResponse.json(
      { error: `${ticketCount} ticket(s) still use this status. Move them first.` },
      { status: 409 },
    )
  }

  await prisma.subDepartmentStatus.delete({ where: { id: statusId } })
  return new NextResponse(null, { status: 204 })
}
