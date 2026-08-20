import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { recordAuditEvent } from "@/lib/audit-log"
import { isConditionGroup, isRuleActions, DEFAULT_CONDITION_GROUP } from "@/lib/rule-validation"

const RULE_SELECT = {
  id: true,
  name: true,
  conditions: true,
  actions: true,
  order: true,
  enabled: true,
  stopProcessing: true,
} as const

/** GET /api/departments/:id/rules — this department's automation rules, in order (RE-03). */
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

  const rules = await prisma.rule.findMany({
    where: { departmentId: id },
    orderBy: { order: "asc" },
    select: RULE_SELECT,
  })
  return NextResponse.json(rules)
}

/** POST /api/departments/:id/rules — create an automation rule (RE-01/02). */
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
  const name = (body.name as string | undefined)?.trim()
  const conditions = body.conditions ?? DEFAULT_CONDITION_GROUP
  const actions = body.actions ?? []
  const enabled = body.enabled !== false
  const stopProcessing = body.stopProcessing === true

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!isConditionGroup(conditions)) {
    return NextResponse.json({ error: "conditions must be a valid condition group" }, { status: 400 })
  }
  const actionsError = isRuleActions(actions)
  if (actionsError) return NextResponse.json({ error: actionsError }, { status: 400 })

  const dept = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const last = await prisma.rule.findFirst({
    where: { departmentId: id },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const rule = await prisma.rule.create({
    data: {
      tenantId: dept.tenantId,
      departmentId: id,
      name,
      conditions,
      actions,
      enabled,
      stopProcessing,
      order: nextOrder,
    },
    select: RULE_SELECT,
  })

  await recordAuditEvent({
    tenantId: dept.tenantId,
    actorId: profile!.id,
    action: "RULE_CREATED",
    targetType: "Rule",
    targetId: rule.id,
    before: null,
    after: rule,
  })

  return NextResponse.json(rule, { status: 201 })
}
