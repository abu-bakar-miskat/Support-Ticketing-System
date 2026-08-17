import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { hasTenantAccess, ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope"
import { badRequest, forbidden } from "@/lib/api-response"

// Switch the caller's active tenant. Members (and super-admins) only.
// Switching resets the active department so it never points into the old tenant.
export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const tenantId = (body.tenantId as string | undefined)?.trim()
  if (!tenantId) return badRequest("tenantId is required")

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  if (!hasTenantAccess(profile, tenantId)) {
    return forbidden("You don't have access to this tenant.")
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    path: "/",
    maxAge: TENANT_COOKIE_MAX_AGE,
    sameSite: "lax",
  })
  // Reset active department — it belongs to the previous tenant.
  res.cookies.set("pen_active_dept", "", { path: "/", maxAge: 0 })
  return res
}
