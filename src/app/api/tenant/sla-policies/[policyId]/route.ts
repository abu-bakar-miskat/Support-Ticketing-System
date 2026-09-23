import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { type ConditionGroup } from "@/lib/rules-engine"
import { conditionsForPriority } from "@/lib/sla-priority-conditions"
import { recordAuditEvent } from "@/lib/audit-log"
import { TicketPriority } from "@/generated/prisma/client"
import { TENANT_POLICY_SELECT, isConditionGroup } from "../route"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

/** Load a tenant-level policy (departmentId null) scoped to the caller's tenant. */
async function loadPolicy(tenantId: string, policyId: string) {
  return prisma.slaPolicy.findFirst({
    where: { id: policyId, tenantId, departmentId: null },
    select: TENANT_POLICY_SELECT,
  })
}

/** PATCH /api/tenant/sla-policies/:policyId — edit or reorder a tenant default. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> },
) {
  const { profile, error } = await requireAdmin("Only tenant admins can manage SLA defaults.")
  if (error) return error
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = profile.activeTenantId
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })

  const { policyId } = await params
  const policy = await loadPolicy(tenantId, policyId)
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: {
    name?: string
    conditions?: ConditionGroup
    firstResponseMins?: number
    resolutionMins?: number
    enabled?: boolean
    order?: number
    priority?: TicketPriority | null
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
  if (body.priority !== undefined) {
    const v = body.priority
    if (v !== null && !(typeof v === "string" && VALID_PRIORITIES.has(v))) {
      return NextResponse.json({ error: "priority is not a valid value" }, { status: 400 })
    }
    data.priority = (v === null ? null : v) as TicketPriority | null
    // Keep match conditions in sync with the priority goal (Jira-style) unless
    // the client explicitly sent conditions in the same request.
    if (body.conditions === undefined) {
      data.conditions = conditionsForPriority(
        data.priority === null ? null : (data.priority as string),
      )
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await prisma.slaPolicy.update({
    where: { id: policyId },
    data,
    select: TENANT_POLICY_SELECT,
  })

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId,
    actorId: profile.id,
    action: "SLA_POLICY_UPDATED",
    targetType: "SlaPolicy",
    targetId: policyId,
    before: policy,
    after: updated,
  })

  return NextResponse.json(updated)
}

/** DELETE /api/tenant/sla-policies/:policyId — remove a tenant default. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ policyId: string }> },
) {
  const { profile, error } = await requireAdmin("Only tenant admins can manage SLA defaults.")
  if (error) return error
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = profile.activeTenantId
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })

  const { policyId } = await params
  const policy = await loadPolicy(tenantId, policyId)
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 })

  const result = await prisma.slaPolicy.deleteMany({
    where: { id: policyId, tenantId, departmentId: null },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 })
  }

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId,
    actorId: profile.id,
    action: "SLA_POLICY_DELETED",
    targetType: "SlaPolicy",
    targetId: policyId,
    before: policy,
    after: null,
  })

  return NextResponse.json({ ok: true })
}
