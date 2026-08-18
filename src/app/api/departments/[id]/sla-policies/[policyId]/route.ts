import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar } from "@/lib/dept-scope"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"
import { recordAuditEvent } from "@/lib/audit-log"

const POLICY_SELECT = {
  id: true,
  name: true,
  conditions: true,
  firstResponseMins: true,
  resolutionMins: true,
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

async function loadPolicy(departmentId: string, policyId: string) {
  return prisma.slaPolicy.findFirst({
    where: { id: policyId, departmentId },
    select: { tenantId: true, ...POLICY_SELECT },
  })
}

/** PATCH /api/departments/:id/sla-policies/:policyId — edit or reorder a policy. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; policyId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, policyId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const policy = await loadPolicy(id, policyId)
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: {
    name?: string
    conditions?: ConditionGroup
    firstResponseMins?: number
    resolutionMins?: number
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
  if (body.firstResponseMins !== undefined) {
    const v = Number(body.firstResponseMins)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: "firstResponseMins must be a positive number" }, { status: 400 })
    }
    data.firstResponseMins = v
  }
  if (body.resolutionMins !== undefined) {
    const v = Number(body.resolutionMins)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ error: "resolutionMins must be a positive number" }, { status: 400 })
    }
    data.resolutionMins = v
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

  const updated = await prisma.slaPolicy.update({ where: { id: policyId }, data, select: POLICY_SELECT })

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId: policy.tenantId,
    actorId: profile!.id,
    action: "SLA_POLICY_UPDATED",
    targetType: "SlaPolicy",
    targetId: policyId,
    before: policy,
    after: updated,
  })

  return NextResponse.json(updated)
}

/** DELETE /api/departments/:id/sla-policies/:policyId — remove a policy. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; policyId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id, policyId } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const policy = await loadPolicy(id, policyId)
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 })

  const result = await prisma.slaPolicy.deleteMany({ where: { id: policyId, departmentId: id } })
  if (result.count === 0) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 })
  }

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId: policy.tenantId,
    actorId: profile!.id,
    action: "SLA_POLICY_DELETED",
    targetType: "SlaPolicy",
    targetId: policyId,
    before: policy,
    after: null,
  })

  return NextResponse.json({ ok: true })
}
