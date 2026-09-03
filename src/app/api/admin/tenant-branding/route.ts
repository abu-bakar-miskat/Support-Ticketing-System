import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden, badRequest } from "@/lib/api-response"
import { getTenantConfig, setTenantBranding } from "@/lib/tenant-config"
import { sanitizeTenantBranding, readTenantBranding } from "@/lib/tenant-branding"

/** True when the caller may edit the active tenant's branding. */
function canEditBranding(profile: { isSuperAdmin?: boolean; role: string; activeTenantId?: string | null; tenantMemberships?: { tenantId: string; role: string }[] }) {
  if (profile.isSuperAdmin) return true
  const tid = profile.activeTenantId
  if (!tid) return false
  return (profile.tenantMemberships ?? []).some((m) => m.tenantId === tid && m.role === "admin")
}

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!profile.activeTenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })

  const tenant = await getTenantConfig(profile.activeTenantId)
  return NextResponse.json({
    tenantName: tenant?.name ?? null,
    branding: readTenantBranding(tenant?.branding),
  })
}

export async function PUT(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!profile.activeTenantId) return NextResponse.json({ error: "No active tenant" }, { status: 400 })
  if (!canEditBranding(profile)) {
    return forbidden("Only a tenant admin or super-admin can edit branding.")
  }

  const body = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null) return badRequest("Invalid body")

  // Accept the branding fields; sanitize drops anything invalid.
  const cleaned = sanitizeTenantBranding({
    displayName: (body as Record<string, unknown>).displayName,
    logoUrl: (body as Record<string, unknown>).logoUrl,
  })

  // Replace the whole branding object (empty when cleared).
  await setTenantBranding(profile.activeTenantId, cleaned ?? {})
  const tenant = await getTenantConfig(profile.activeTenantId)
  return NextResponse.json({ ok: true, branding: readTenantBranding(tenant?.branding) })
}
