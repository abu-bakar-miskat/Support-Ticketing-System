import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { isValidTenantType } from "@/lib/tenant-types"
import { isValidTenantStatus, suspendTenant, reactivateTenant, softDeleteTenant } from "@/lib/tenant-lifecycle"

type Params = { params: Promise<{ id: string }> }

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002"
}

/** Update tenant identity (name/slug/type) and/or lifecycle status. Super-admin only. */
export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const name = typeof body.name === "string" ? body.name.trim() : undefined
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : undefined

  if (
    body.type === undefined &&
    body.status === undefined &&
    name === undefined &&
    slug === undefined
  ) {
    return badRequest("No fields to update")
  }
  if (name !== undefined && !name) {
    return badRequest("Name cannot be empty")
  }
  if (slug !== undefined && !SLUG_RE.test(slug)) {
    return badRequest("Slug must be lowercase letters, numbers, and hyphens")
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

  const identity: { type?: string; name?: string; slug?: string } = {}
  if (body.type !== undefined) {
    identity.type = body.type
  }
  if (name !== undefined) identity.name = name
  if (slug !== undefined) identity.slug = slug

  if (Object.keys(identity).length > 0) {
    try {
      await prisma.tenant.update({ where: { id }, data: identity })
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json({ error: "A tenant with that slug already exists" }, { status: 409 })
      }
      throw e
    }
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
