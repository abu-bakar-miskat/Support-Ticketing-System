import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canAdminDeptSettings, departmentIdInScope } from "@/lib/dept-scope"
import { recordAuditEvent } from "@/lib/audit-log"
import { isConditionGroup, isRuleActions, DEFAULT_CONDITION_GROUP } from "@/lib/rule-validation"
import { assertRuleActionTargetsInDepartment } from "@/lib/rule-action-targets"
import { assertFeatureEnabled } from "@/lib/feature-flags"

const RULE_SELECT = {
  id: true,
  name: true,
  conditions: true,
  actions: true,
  order: true,
  enabled: true,
  stopProcessing: true,
  formConfigId: true,
} as const

/**
 * Validate that `formConfigId` (if provided) belongs to department `id`.
 * Automation rules are department-scoped (sub-departments inherit them), so
 * form-scoped rules are not pinned to a sub-department.
 */
async function resolveFormScope(
  departmentId: string,
  raw: string | null | undefined,
): Promise<{ formConfigId: string | null } | { error: NextResponse }> {
  const formConfigId = raw && raw.trim() ? raw.trim() : null
  if (!formConfigId) return { formConfigId: null }
  const form = await prisma.intakeFormConfig.findFirst({
    where: { id: formConfigId, departmentId },
    select: { id: true },
  })
  if (!form) {
    return { error: NextResponse.json({ error: "Form not found in department" }, { status: 404 }) }
  }
  return { formConfigId }
}

/** GET /api/departments/:id/rules — this department's automation rules, in order (RE-03). */
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

  // Form-scoped surface: `?formConfigId=` returns only that form's rules.
  const formScope = await resolveFormScope(id, req.nextUrl.searchParams.get("formConfigId"))
  if ("error" in formScope) return formScope.error
  if (formScope.formConfigId) {
    const rules = await prisma.rule.findMany({
      where: { departmentId: id, formConfigId: formScope.formConfigId },
      orderBy: { order: "asc" },
      select: RULE_SELECT,
    })
    return NextResponse.json(rules)
  }

  // Department-wide rules only. Sub-departments inherit these — there is no
  // per-sub-department automation-rule surface.
  const rules = await prisma.rule.findMany({
    where: { departmentId: id, subDepartmentId: null, formConfigId: null },
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
  if (!canAdminDeptSettings(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const deptForFlag = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!deptForFlag) return NextResponse.json({ error: "Department not found" }, { status: 404 })
  const featureCheck = await assertFeatureEnabled(deptForFlag.tenantId, "assignmentRules")
  if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 403 })

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
  const targetCheck = await assertRuleActionTargetsInDepartment(id, actions)
  if (!targetCheck.ok) return NextResponse.json({ error: targetCheck.error }, { status: 400 })

  const dept = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // Automation rules are always department-scoped (subDepartmentId = null).
  // Optional formConfigId scopes a rule to one support form; sub-departments
  // inherit the department's rules at evaluation time.
  const formScope = await resolveFormScope(id, body.formConfigId as string | undefined)
  if ("error" in formScope) return formScope.error

  const last = await prisma.rule.findFirst({
    where: {
      departmentId: id,
      formConfigId: formScope.formConfigId,
      ...(formScope.formConfigId ? {} : { subDepartmentId: null }),
    },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const rule = await prisma.rule.create({
    data: {
      tenantId: dept.tenantId,
      departmentId: id,
      subDepartmentId: null,
      formConfigId: formScope.formConfigId,
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
