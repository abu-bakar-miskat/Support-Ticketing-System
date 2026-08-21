import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"

/**
 * PATCH /api/departments/:id/rules/reorder — set the evaluation order (RE-03).
 * Body: { ruleIds: string[] } — the desired order; each rule's `order` is set to
 * its index. Only rules belonging to this department are updated.
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
  const ruleIds = body.ruleIds
  if (!Array.isArray(ruleIds) || ruleIds.some((r) => typeof r !== "string")) {
    return NextResponse.json({ error: "ruleIds must be an array of strings" }, { status: 400 })
  }
  const subDepartmentId = (body.subDepartmentId as string | undefined)?.trim() || null

  // Only reorder rules that belong to this department + sub-department surface.
  const owned = await prisma.rule.findMany({
    where: { departmentId: id, subDepartmentId, id: { in: ruleIds } },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((r) => r.id))

  await prisma.$transaction(
    ruleIds
      .filter((rid: string) => ownedIds.has(rid))
      .map((rid: string, index: number) =>
        prisma.rule.update({ where: { id: rid }, data: { order: index } }),
      ),
  )

  const rules = await prisma.rule.findMany({
    where: { departmentId: id, subDepartmentId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, conditions: true, actions: true, order: true, enabled: true, stopProcessing: true },
  })
  return NextResponse.json(rules)
}
