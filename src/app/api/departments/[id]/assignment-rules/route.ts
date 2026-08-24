import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"
import { recordAuditEvent } from "@/lib/audit-log"

const RULE_SELECT = {
  id: true,
  name: true,
  conditions: true,
  agentId: true,
  enabled: true,
  order: true,
  formConfigId: true,
} as const

function isConditionGroup(value: unknown): value is ConditionGroup {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  if (v.combinator !== "AND" && v.combinator !== "OR") return false
  if (!Array.isArray(v.conditions)) return false
  try {
    evaluateConditionGroup(v as ConditionGroup, {})
    return true
  } catch {
    return false
  }
}

/** Confirm a sub-department belongs to the department; null when it does not. */
async function loadOwnedSubDepartment(departmentId: string, subDepartmentId: string) {
  return prisma.subDepartment.findFirst({
    where: { id: subDepartmentId, departmentId },
    select: { id: true },
  })
}

/** Confirm a support form belongs to the department; null when it does not. */
async function loadOwnedForm(departmentId: string, formConfigId: string) {
  return prisma.intakeFormConfig.findFirst({
    where: { id: formConfigId, departmentId },
    select: { id: true, intakeSubDepartmentId: true },
  })
}

/**
 * GET /api/departments/:id/assignment-rules — rule-based assignment rules, in
 * order. Scoping (most specific wins):
 *   `?formConfigId=` → rules for that support form.
 *   `?subDepartmentId=` → that sub-department's non-form rules.
 *   neither → department-wide rules (both scopes null).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formConfigId = req.nextUrl.searchParams.get("formConfigId")
  const subDepartmentId = req.nextUrl.searchParams.get("subDepartmentId")

  if (formConfigId) {
    if (!(await loadOwnedForm(id, formConfigId))) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }
    const rules = await prisma.assignmentRule.findMany({
      where: { departmentId: id, formConfigId },
      orderBy: { order: "asc" },
      select: RULE_SELECT,
    })
    return NextResponse.json(rules)
  }

  if (subDepartmentId && !(await loadOwnedSubDepartment(id, subDepartmentId))) {
    return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
  }

  const rules = await prisma.assignmentRule.findMany({
    where: { departmentId: id, subDepartmentId: subDepartmentId ?? null, formConfigId: null },
    orderBy: { order: "asc" },
    select: RULE_SELECT,
  })
  return NextResponse.json(rules)
}

/** POST /api/departments/:id/assignment-rules — create a rule-based assignment rule (ASG-01). */
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
  const conditions = body.conditions ?? { combinator: "AND", conditions: [] }
  const agentId = body.agentId as string | undefined
  const rawFormConfigId = body.formConfigId as unknown
  const formConfigId =
    typeof rawFormConfigId === "string" && rawFormConfigId.length > 0 ? rawFormConfigId : null
  const rawSubDepartmentId = body.subDepartmentId as unknown
  let subDepartmentId =
    typeof rawSubDepartmentId === "string" && rawSubDepartmentId.length > 0 ? rawSubDepartmentId : null

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!isConditionGroup(conditions)) {
    return NextResponse.json({ error: "conditions must be a valid condition group" }, { status: 400 })
  }
  if (!agentId || typeof agentId !== "string") {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 })
  }

  const dept = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // Form-scoped rule: validate the form and pin its sub-department for consistency.
  if (formConfigId) {
    const form = await loadOwnedForm(id, formConfigId)
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })
    subDepartmentId = form.intakeSubDepartmentId
  } else if (subDepartmentId && !(await loadOwnedSubDepartment(id, subDepartmentId))) {
    return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
  }

  const last = await prisma.assignmentRule.findFirst({
    where: { departmentId: id, formConfigId, subDepartmentId: formConfigId ? undefined : subDepartmentId },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const rule = await prisma.assignmentRule.create({
    data: {
      tenantId: dept.tenantId,
      departmentId: id,
      subDepartmentId,
      formConfigId,
      name,
      conditions,
      agentId,
      order: nextOrder,
    },
    select: RULE_SELECT,
  })

  // NFR-09/DAT-05 (slice 20): rule-based assignment-rule changes are audited.
  await recordAuditEvent({
    tenantId: dept.tenantId,
    actorId: profile!.id,
    action: "ASSIGNMENT_RULE_CREATED",
    targetType: "AssignmentRule",
    targetId: rule.id,
    before: null,
    after: rule,
  })

  return NextResponse.json(rule, { status: 201 })
}
