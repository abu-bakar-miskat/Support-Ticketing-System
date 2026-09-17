import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canAdminDeptSettings, departmentIdInScope } from "@/lib/dept-scope"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"
import { conditionsForPriority } from "@/lib/sla-priority-conditions"
import { recordAuditEvent } from "@/lib/audit-log"
import { TicketPriority } from "@/generated/prisma/client"
import { assertFeatureEnabled } from "@/lib/feature-flags"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

/** Coerce an optional string field: trimmed non-empty string, else null. */
function optionalId(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

/** Parse a body field into a deduped list of user-id strings. */
export function parseAssigneeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
  return [...new Set(ids.map((s) => s.trim()))]
}

const POLICY_SELECT = {
  id: true,
  name: true,
  conditions: true,
  firstResponseMins: true,
  resolutionMins: true,
  enabled: true,
  order: true,
  formConfigId: true,
  subDepartmentId: true,
  priority: true,
  assigneeId: true,
  assignees: { select: { userId: true } },
} as const

type PolicyRow = { assignees: { userId: string }[] } & Record<string, unknown>

/** Flatten the assignees relation into a plain `assigneeIds` array for the API. */
export function shapePolicy({ assignees, ...rest }: PolicyRow) {
  return { ...rest, assigneeIds: assignees.map((a) => a.userId) }
}

function isConditionGroup(value: unknown): value is ConditionGroup {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  if (v.combinator !== "AND" && v.combinator !== "OR") return false
  if (!Array.isArray(v.conditions)) return false
  try {
    // Cheap structural validation: run it against an empty value set.
    evaluateConditionGroup(v as ConditionGroup, {})
    return true
  } catch {
    return false
  }
}

/** Validate that `subDepartmentId` (if given) belongs to department `id`. */
async function resolveSubDepartmentScope(
  departmentId: string,
  raw: string | null | undefined,
): Promise<{ subDepartmentId: string | null } | { error: NextResponse }> {
  const subDepartmentId = raw && raw.trim() ? raw.trim() : null
  if (subDepartmentId) {
    const sub = await prisma.subDepartment.findFirst({
      where: { id: subDepartmentId, departmentId },
      select: { id: true },
    })
    if (!sub) {
      return { error: NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 }) }
    }
  }
  return { subDepartmentId }
}

/** GET /api/departments/:id/sla-policies — this department's SLA policies, in order. */
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

  // `?formConfigId=` returns every issue authored on one support form.
  const formConfigId = req.nextUrl.searchParams.get("formConfigId")
  if (formConfigId && formConfigId.trim()) {
    const policies = await prisma.slaPolicy.findMany({
      where: { departmentId: id, formConfigId: formConfigId.trim() },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: POLICY_SELECT,
    })
    return NextResponse.json(policies.map(shapePolicy))
  }

  // Department-scoped: every policy in the department. Sub-departments inherit
  // these; `subDepartmentId` on a policy is an optional per-issue routing target,
  // not a separate policy surface.
  const policies = await prisma.slaPolicy.findMany({
    where: { departmentId: id },
    orderBy: { order: "asc" },
    select: POLICY_SELECT,
  })
  return NextResponse.json(policies.map(shapePolicy))
}

/** POST /api/departments/:id/sla-policies — create an SLA policy (SLA-01/02). */
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
  const deptRow = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!deptRow) return NextResponse.json({ error: "Department not found" }, { status: 404 })
  const featureCheck = await assertFeatureEnabled(deptRow.tenantId, "slaPolicies")
  if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  const firstResponseMins = Number(body.firstResponseMins)
  const resolutionMins = Number(body.resolutionMins)
  const formConfigId = optionalId(body.formConfigId)
  // Person assignment on SLA issues is retired — tickets use the department's
  // assignment method. Ignore any client-supplied assigneeIds.
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

  const dept = await prisma.department.findUnique({ where: { id }, select: { tenantId: true } })
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // Optional per-issue "concerned" sub-department (ticket routing). Not a policy
  // scope — policies are always department-owned; sub-departments inherit them.
  const concerned = await resolveSubDepartmentScope(id, body.subDepartmentId as string | undefined)
  if ("error" in concerned) return concerned.error

  const last = await prisma.slaPolicy.findFirst({
    where: { departmentId: id },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const policy = await prisma.slaPolicy.create({
    data: {
      tenantId: dept.tenantId,
      departmentId: id,
      subDepartmentId: concerned.subDepartmentId,
      name,
      conditions,
      firstResponseMins,
      resolutionMins,
      order: nextOrder,
      formConfigId,
      priority: priority as TicketPriority | null,
    },
    select: POLICY_SELECT,
  })

  // NFR-09/DAT-05 (slice 20): SLA policy changes are audited.
  await recordAuditEvent({
    tenantId: dept.tenantId,
    actorId: profile!.id,
    action: "SLA_POLICY_CREATED",
    targetType: "SlaPolicy",
    targetId: policy.id,
    before: null,
    after: policy,
  })

  return NextResponse.json(shapePolicy(policy), { status: 201 })
}
