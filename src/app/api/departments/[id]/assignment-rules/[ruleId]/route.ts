import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"

const RULE_SELECT = {
  id: true,
  name: true,
  conditions: true,
  agentId: true,
  enabled: true,
  order: true,
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

async function loadRule(departmentId: string, ruleId: string) {
  return prisma.assignmentRule.findFirst({ where: { id: ruleId, departmentId }, select: { id: true } })
}

/** PATCH /api/departments/:id/assignment-rules/:ruleId — edit or reorder a rule. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, ruleId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rule = await loadRule(id, ruleId)
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: {
    name?: string
    conditions?: ConditionGroup
    agentId?: string
    enabled?: boolean
    order?: number
  } = {}

  if (body.name !== undefined) {
    const name = (body.name as string)?.trim()
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
    data.name = name
  }
  if (body.conditions !== undefined) {
    if (!isConditionGroup(body.conditions)) {
      return NextResponse.json({ error: "conditions must be a valid condition group" }, { status: 400 })
    }
    data.conditions = body.conditions
  }
  if (body.agentId !== undefined) {
    if (typeof body.agentId !== "string" || !body.agentId) {
      return NextResponse.json({ error: "agentId must be a non-empty string" }, { status: 400 })
    }
    data.agentId = body.agentId
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
    }
    data.enabled = body.enabled
  }
  if (body.order !== undefined) {
    const v = Number(body.order)
    if (!Number.isInteger(v)) {
      return NextResponse.json({ error: "order must be an integer" }, { status: 400 })
    }
    data.order = v
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await prisma.assignmentRule.update({ where: { id: ruleId }, data, select: RULE_SELECT })
  return NextResponse.json(updated)
}

/** DELETE /api/departments/:id/assignment-rules/:ruleId — remove a rule. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, ruleId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const result = await prisma.assignmentRule.deleteMany({ where: { id: ruleId, departmentId: id } })
  if (result.count === 0) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
