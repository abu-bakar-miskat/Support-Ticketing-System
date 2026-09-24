import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"
import { conditionsForPriority } from "@/lib/sla-priority-conditions"
import { recordAuditEvent } from "@/lib/audit-log"
import { TicketPriority } from "@/generated/prisma/client"
import { assertFeatureEnabled } from "@/lib/feature-flags"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

// Tenant-level SLA defaults have no support-form / sub-department routing — those
// are department-scoped concepts. A policy here has a null departmentId.
export const TENANT_POLICY_SELECT = {
  id: true,
  name: true,
  conditions: true,
  firstResponseMins: true,
  resolutionMins: true,
  enabled: true,
  order: true,
  priority: true,
} as const

/** Coerce an optional string field: trimmed non-empty string, else null. */
function optionalId(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

export function isConditionGroup(value: unknown): value is ConditionGroup {
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

/** GET /api/tenant/sla-policies — the tenant-level default SLA policies, in order. */
export async function GET() {
  const { profile, error } = await requireAdmin("Only tenant admins can manage SLA defaults.")
  if (error) return error
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = profile.activeTenantId
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })

  const policies = await prisma.slaPolicy.findMany({
    where: { tenantId, departmentId: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: TENANT_POLICY_SELECT,
  })
  return NextResponse.json(policies)
}

/** POST /api/tenant/sla-policies — create a tenant-level default SLA policy. */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdmin("Only tenant admins can manage SLA defaults.")
  if (error) return error
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = profile.activeTenantId
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })

  const featureCheck = await assertFeatureEnabled(tenantId, "slaPolicies")
  if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  const firstResponseMins = Number(body.firstResponseMins)
  const resolutionMins = Number(body.resolutionMins)
  const priority = optionalId(body.priority)
  // Jira-style: priority field drives match conditions. Explicit conditions in
  // the body still win when provided and valid; otherwise sync from priority.
  const conditions =
    body.conditions !== undefined && isConditionGroup(body.conditions)
      ? body.conditions
      : conditionsForPriority(priority)

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!isConditionGroup(conditions)) {
    return NextResponse.json({ error: "conditions must be a valid condition group" }, { status: 400 })
  }
  if (!Number.isFinite(firstResponseMins) || firstResponseMins <= 0) {
    return NextResponse.json({ error: "firstResponseMins must be a positive number" }, { status: 400 })
  }
  if (!Number.isFinite(resolutionMins) || resolutionMins <= 0) {
    return NextResponse.json({ error: "resolutionMins must be a positive number" }, { status: 400 })
  }
  if (priority && !VALID_PRIORITIES.has(priority)) {
    return NextResponse.json({ error: "priority is not a valid value" }, { status: 400 })
  }

  const last = await prisma.slaPolicy.findFirst({
    where: { tenantId, departmentId: null },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const policy = await prisma.slaPolicy.create({
    data: {
      tenantId,
      departmentId: null,
      name,
      conditions,
      firstResponseMins,
      resolutionMins,
      order: nextOrder,
      priority: priority as TicketPriority | null,
    },
    select: TENANT_POLICY_SELECT,
  })

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId,
    actorId: profile.id,
    action: "SLA_POLICY_CREATED",
    targetType: "SlaPolicy",
    targetId: policy.id,
    before: null,
    after: policy,
  })

  return NextResponse.json(policy, { status: 201 })
}
