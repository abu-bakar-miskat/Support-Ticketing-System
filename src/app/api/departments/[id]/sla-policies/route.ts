import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { evaluateConditionGroup, type ConditionGroup } from "@/lib/rules-engine"
import { recordAuditEvent } from "@/lib/audit-log"
import { TicketPriority } from "@/generated/prisma/client"

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

  const scope = await resolveSubDepartmentScope(id, req.nextUrl.searchParams.get("subDepartmentId"))
  if ("error" in scope) return scope.error

  // Without a subDepartmentId, return only department-wide policies (null).
  const policies = await prisma.slaPolicy.findMany({
    where: { departmentId: id, subDepartmentId: scope.subDepartmentId },
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
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  const conditions = body.conditions ?? { combinator: "AND", conditions: [] }
  const firstResponseMins = Number(body.firstResponseMins)
  const resolutionMins = Number(body.resolutionMins)
  const formConfigId = optionalId(body.formConfigId)
  const assigneeIds = parseAssigneeIds(body.assigneeIds)
  const priority = optionalId(body.priority)

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

  const scope = await resolveSubDepartmentScope(id, body.subDepartmentId as string | undefined)
  if ("error" in scope) return scope.error

  const last = await prisma.slaPolicy.findFirst({
    where: { departmentId: id, subDepartmentId: scope.subDepartmentId },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const nextOrder = last ? last.order + 1 : 0

  const policy = await prisma.slaPolicy.create({
    data: {
      tenantId: dept.tenantId,
      departmentId: id,
      subDepartmentId: scope.subDepartmentId,
      name,
      conditions,
      firstResponseMins,
      resolutionMins,
      order: nextOrder,
      formConfigId,
      priority: priority as TicketPriority | null,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
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
