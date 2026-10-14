import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { recordAuditEvent } from "@/lib/audit-log"
import { requirePortalKeyAdmin } from "@/lib/portal-key-admin"

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { id, issueId } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key || !auth.profile) return auth.error
  const existing = await prisma.slaPolicy.findFirst({
    where: { id: issueId, formConfigId: auth.key.formConfig.id },
    select: { tenantId: true, ...POLICY_SELECT },
  })
  if (!existing) return NextResponse.json({ error: "Issue not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const data: {
    name?: string
    departmentId?: string
    subDepartmentId?: string | null
    firstResponseMins?: number
    resolutionMins?: number
    enabled?: boolean
  } = {}
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
    if (!name) return NextResponse.json({ error: "Issue name is required" }, { status: 400 })
    data.name = name
  }
  for (const field of ["firstResponseMins", "resolutionMins"] as const) {
    if (body[field] !== undefined) {
      const value = Number(body[field])
      if (!Number.isFinite(value) || value <= 0 || value > 525_600) {
        return NextResponse.json({ error: `${field} must be a positive number of minutes` }, { status: 400 })
      }
      data[field] = value
    }
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 })
    }
    data.enabled = body.enabled
  }
  if (body.departmentId !== undefined || body.subDepartmentId !== undefined) {
    const departmentId = body.departmentId !== undefined
      ? (typeof body.departmentId === "string" ? body.departmentId.trim() : "")
      : existing.departmentId
    if (!departmentId) {
      return NextResponse.json({ error: "A department is required" }, { status: 400 })
    }
    const department = await prisma.department.findFirst({
      where: { id: departmentId, tenantId: auth.profile.activeTenantId! },
      select: { id: true },
    })
    if (!department) return NextResponse.json({ error: "Department not found" }, { status: 400 })

    const subDepartmentId = typeof body.subDepartmentId === "string" && body.subDepartmentId.trim()
      ? body.subDepartmentId.trim()
      : body.subDepartmentId === undefined && body.departmentId === undefined
        ? existing.subDepartmentId
        : null
    if (!subDepartmentId) return NextResponse.json({ error: "A sub-department is required" }, { status: 400 })
    const found = await prisma.subDepartment.findFirst({
      where: { id: subDepartmentId, departmentId },
      select: { id: true },
    })
    if (!found) return NextResponse.json({ error: "Sub-department not found" }, { status: 400 })
    data.departmentId = departmentId
    data.subDepartmentId = subDepartmentId
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await prisma.slaPolicy.update({
    where: { id: issueId },
    data,
    select: POLICY_SELECT,
  })
  await recordAuditEvent({
    tenantId: existing.tenantId,
    actorId: auth.profile.id,
    action: "SLA_POLICY_UPDATED",
    targetType: "SlaPolicy",
    targetId: issueId,
    before: existing,
    after: updated,
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { id, issueId } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key || !auth.profile) return auth.error
  const existing = await prisma.slaPolicy.findFirst({
    where: { id: issueId, formConfigId: auth.key.formConfig.id },
    select: { tenantId: true, ...POLICY_SELECT },
  })
  if (!existing) return NextResponse.json({ error: "Issue not found" }, { status: 404 })
  await prisma.slaPolicy.delete({ where: { id: issueId } })
  await recordAuditEvent({
    tenantId: existing.tenantId,
    actorId: auth.profile.id,
    action: "SLA_POLICY_DELETED",
    targetType: "SlaPolicy",
    targetId: issueId,
    before: existing,
    after: null,
  })
  return NextResponse.json({ ok: true })
}
