import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isFeatureKey } from "@/lib/feature-keys"
import { listFeatureFlags, setFeatureFlag } from "@/lib/feature-flags"

// SA-04: Super Admin view of one tenant's feature flags (every known key, with its
// effective enabled state — fail-open, so an absent row shows as enabled).
export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const tenantId = request.nextUrl.searchParams.get("tenantId")
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 })
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  const flags = await listFeatureFlags(tenantId)
  return NextResponse.json({ tenantId, flags })
}

// SA-04: toggle one named feature for one tenant. Writes an audit event
// (atomically with the flag change — see lib/feature-flags.ts).
export async function PUT(request: NextRequest) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : ""
  const key = body?.key
  const enabled = body?.enabled

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 })
  }
  if (!isFeatureKey(key)) {
    return NextResponse.json({ error: "Unknown feature key" }, { status: 400 })
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  await setFeatureFlag({ tenantId, key, enabled, actorId: profile!.id })
  return NextResponse.json({ ok: true })
}
