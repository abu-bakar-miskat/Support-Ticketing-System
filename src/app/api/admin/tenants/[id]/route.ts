import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { isValidTenantType } from "@/lib/tenant-types"
import { isValidTenantStatus, suspendTenant, reactivateTenant, softDeleteTenant } from "@/lib/tenant-lifecycle"

type Params = { params: Promise<{ id: string }> }

/** Update tenant identity fields (type) and/or lifecycle status (SA-01: active/suspended). Super-admin only. */
export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  if (body.type === undefined && body.status === undefined) {
    return badRequest("No fields to update")
  }
  if (body.type !== undefined && !isValidTenantType(body.type)) {
    return badRequest("Invalid tenant type")
  }
  if (body.status !== undefined && !isValidTenantStatus(body.status)) {
    return badRequest("status must be one of: active, suspended")
  }

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (tenant.deletedAt) {
    return NextResponse.json({ error: "Tenant is soft-deleted — restore it first" }, { status: 409 })
  }

  if (body.status !== undefined) {
    const updated = body.status === "suspended"
      ? await suspendTenant({ tenantId: id, actorId: profile!.id })
      : await reactivateTenant({ tenantId: id, actorId: profile!.id })
    if (!updated) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  if (body.type !== undefined) {
    await prisma.tenant.update({ where: { id }, data: { type: body.type } })
  }

  const result = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, type: true, status: true, deletedAt: true },
  })
  return NextResponse.json(result)
}

/** Soft-delete a tenant (SA-01) — reversible, no data is removed. Super-admin only. */
export async function DELETE(_request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const updated = await softDeleteTenant({ tenantId: id, actorId: profile!.id })
  if (!updated) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  return NextResponse.json(updated)
}
