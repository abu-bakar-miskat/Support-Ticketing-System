import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"
import { recordAuditEvent } from "@/lib/audit-log"
import { isConditionGroup, isRuleActions } from "@/lib/rule-validation"

const RULE_SELECT = {
  id: true,
  name: true,
  conditions: true,
  actions: true,
  order: true,
  enabled: true,
  stopProcessing: true,
} as const

type Params = { params: Promise<{ id: string; ruleId: string }> }

/** PATCH /api/departments/:id/rules/:ruleId — update a rule (name/conditions/actions/enabled/stopProcessing). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, ruleId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.rule.findFirst({
    where: { id: ruleId, departmentId: id },
    select: { ...RULE_SELECT, tenantId: true },
  })
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = (body.name as string).trim()
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
    data.name = name
  }
  if (body.conditions !== undefined) {
    if (!isConditionGroup(body.conditions)) {
      return NextResponse.json({ error: "conditions must be a valid condition group" }, { status: 400 })
    }
    data.conditions = body.conditions
  }
  if (body.actions !== undefined) {
    const actionsError = isRuleActions(body.actions)
    if (actionsError) return NextResponse.json({ error: actionsError }, { status: 400 })
    data.actions = body.actions
  }
  if (body.enabled !== undefined) data.enabled = body.enabled === true
  if (body.stopProcessing !== undefined) data.stopProcessing = body.stopProcessing === true

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const updated = await prisma.rule.update({
    where: { id: ruleId },
    data,
    select: RULE_SELECT,
  })

  await recordAuditEvent({
    tenantId: existing.tenantId,
    actorId: profile!.id,
    action: "RULE_UPDATED",
    targetType: "Rule",
    targetId: ruleId,
    before: { id: existing.id, name: existing.name, conditions: existing.conditions, actions: existing.actions, enabled: existing.enabled, stopProcessing: existing.stopProcessing, order: existing.order },
    after: updated,
  })

  return NextResponse.json(updated)
}

/** DELETE /api/departments/:id/rules/:ruleId — delete a rule. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, ruleId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.rule.findFirst({
    where: { id: ruleId, departmentId: id },
    select: { id: true, tenantId: true, name: true },
  })
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 })

  await prisma.rule.delete({ where: { id: ruleId } })

  await recordAuditEvent({
    tenantId: existing.tenantId,
    actorId: profile!.id,
    action: "RULE_DELETED",
    targetType: "Rule",
    targetId: ruleId,
    before: { id: existing.id, name: existing.name },
    after: null,
  })

  return NextResponse.json({ ok: true })
}
