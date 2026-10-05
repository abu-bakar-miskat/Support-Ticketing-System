import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { recordAuditEvent } from "@/lib/audit-log"
import { requirePortalKeyAdmin } from "@/lib/portal-key-admin"
import { conditionsForPriority } from "@/lib/sla-priority-conditions"

const POLICY_SELECT = {
  id: true,
  name: true,
  departmentId: true,
  subDepartmentId: true,
  firstResponseMins: true,
  resolutionMins: true,
  enabled: true,
  order: true,
} as const

async function resolveIssueRoute(tenantId: string, departmentRaw: unknown, subDepartmentRaw: unknown) {
  const departmentId = typeof departmentRaw === "string" ? departmentRaw.trim() : ""
  if (!departmentId) return { departmentId: null, subDepartmentId: null, error: "A department is required" }
  const department = await prisma.department.findFirst({
    where: { id: departmentId, tenantId },
    select: { id: true },
  })
  if (!department) return { departmentId: null, subDepartmentId: null, error: "Department not found" }

  const subDepartmentId = typeof subDepartmentRaw === "string" && subDepartmentRaw.trim()
    ? subDepartmentRaw.trim()
    : null
  if (subDepartmentId) {
    const found = await prisma.subDepartment.findFirst({
      where: { id: subDepartmentId, departmentId },
      select: { id: true },
    })
    return found
      ? { departmentId, subDepartmentId: found.id, error: null }
      : { departmentId: null, subDepartmentId: null, error: "Sub-department not found" }
  }
  return { departmentId: null, subDepartmentId: null, error: "A sub-department is required" }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key) return auth.error

  const policies = await prisma.slaPolicy.findMany({
    where: { formConfigId: auth.key.formConfig.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: POLICY_SELECT,
  })
  return NextResponse.json(policies)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key || !auth.profile) return auth.error
  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
  const firstResponseMins = Number(body.firstResponseMins)
  const resolutionMins = Number(body.resolutionMins)
  if (!name) return NextResponse.json({ error: "Issue name is required" }, { status: 400 })
  if (!Number.isFinite(firstResponseMins) || firstResponseMins <= 0 || firstResponseMins > 525_600) {
    return NextResponse.json({ error: "First-response SLA must be a positive number of minutes" }, { status: 400 })
  }
  if (!Number.isFinite(resolutionMins) || resolutionMins <= 0 || resolutionMins > 525_600) {
    return NextResponse.json({ error: "Resolution SLA must be a positive number of minutes" }, { status: 400 })
  }
  const route = await resolveIssueRoute(
    auth.profile.activeTenantId!,
    body.departmentId,
    body.subDepartmentId,
  )
  if (route.error) {
    return NextResponse.json({ error: route.error }, { status: 400 })
  }

  const last = await prisma.slaPolicy.findFirst({
    where: { formConfigId: auth.key.formConfig.id },
    orderBy: { order: "desc" },
    select: { order: true },
  })
  const policy = await prisma.slaPolicy.create({
    data: {
      tenantId: auth.profile.activeTenantId!,
      departmentId: route.departmentId!,
      formConfigId: auth.key.formConfig.id,
      subDepartmentId: route.subDepartmentId!,
      name,
      conditions: conditionsForPriority(null),
      firstResponseMins,
      resolutionMins,
      order: (last?.order ?? -1) + 1,
      enabled: true,
    },
    select: POLICY_SELECT,
  })
  await recordAuditEvent({
    tenantId: auth.profile.activeTenantId!,
    actorId: auth.profile.id,
    action: "SLA_POLICY_CREATED",
    targetType: "SlaPolicy",
    targetId: policy.id,
    before: null,
    after: policy,
  })
  return NextResponse.json(policy, { status: 201 })
}
