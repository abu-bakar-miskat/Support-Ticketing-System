import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { getTenantConfig, setTenantBranding } from "@/lib/tenant-config"
import { sanitizeTenantBranding, readTenantBranding } from "@/lib/tenant-branding"

type Params = { params: Promise<{ id: string }> }

// Super-admin: read/edit ANY tenant's branding (without switching into it).
export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error
  const { id } = await params

  const tenant = await getTenantConfig(id)
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  return NextResponse.json({ tenantName: tenant.name, branding: readTenantBranding(tenant.branding) })
}

export async function PUT(request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error
  const { id } = await params

  const tenant = await getTenantConfig(id)
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null) return badRequest("Invalid body")
  const raw = body as Record<string, unknown>

  const cleaned = sanitizeTenantBranding({
    displayName: raw.displayName,
    logoUrl: raw.logoUrl,
  })

  await setTenantBranding(id, cleaned ?? {})
  const updated = await getTenantConfig(id)
  return NextResponse.json({ ok: true, branding: readTenantBranding(updated?.branding) })
}
