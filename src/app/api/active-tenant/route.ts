import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import {
  hasTenantAccess,
  ACTIVE_TENANT_COOKIE,
  TENANT_COOKIE_MAX_AGE,
  getActiveTenantCookie,
} from "@/lib/tenant-scope"
import {
  TENANT_SLUG_COOKIE,
  DEPT_SLUG_COOKIE,
  SUBDEPT_SLUG_COOKIE,
} from "@/lib/tenant-path"
import { badRequest, forbidden } from "@/lib/api-response"

const COOKIE_BASE = {
  path: "/",
  maxAge: TENANT_COOKIE_MAX_AGE,
  sameSite: "lax" as const,
}

/** Write active-tenant id + matching slug, and clear department scope from the prior tenant. */
export function applyActiveTenantCookies(
  res: NextResponse,
  tenant: { id: string; slug: string },
) {
  res.cookies.set(ACTIVE_TENANT_COOKIE, tenant.id, {
    ...COOKIE_BASE,
    httpOnly: true,
  })
  res.cookies.set(TENANT_SLUG_COOKIE, tenant.slug, COOKIE_BASE)
  // Department / sub-department cookies belong to the previous tenant — drop
  // them so a stale slug can't rewrite URLs into the wrong org.
  res.cookies.set("pen_active_dept", "", { path: "/", maxAge: 0 })
  res.cookies.set("pen_active_team", "", { path: "/", maxAge: 0 })
  res.cookies.set(DEPT_SLUG_COOKIE, "", { path: "/", maxAge: 0 })
  res.cookies.set(SUBDEPT_SLUG_COOKIE, "", { path: "/", maxAge: 0 })
}

/**
 * Heal a desynced slug cookie: the id cookie is authoritative. Returns the
 * active tenant (or null). Always re-writes the slug cookie when a tenant
 * resolves so /vcad/… never shows another org's data.
 */
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const cookieId = await getActiveTenantCookie()
  let tenantId: string | null = cookieId

  // Prefer the cookie when the caller can access it; otherwise fall back the
  // same way resolveActiveTenantId does so the slug we mint matches the id
  // getProfile will actually use.
  if (tenantId && !hasTenantAccess(profile, tenantId)) {
    tenantId = (profile.tenantIds ?? [])[0] ?? null
  }
  if (!tenantId && profile.isSuperAdmin) {
    const first = await prisma.tenant.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    tenantId = first?.id ?? null
  }
  if (!tenantId) {
    tenantId = (profile.tenantIds ?? [])[0] ?? null
  }
  if (!tenantId) return NextResponse.json({ tenant: null })

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) return NextResponse.json({ tenant: null })

  const res = NextResponse.json({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
  })
  // Re-assert the slug cookie so it cannot drift from the id cookie.
  res.cookies.set(TENANT_SLUG_COOKIE, tenant.slug, COOKIE_BASE)
  if (cookieId !== tenant.id) {
    res.cookies.set(ACTIVE_TENANT_COOKIE, tenant.id, {
      ...COOKIE_BASE,
      httpOnly: true,
    })
  }
  return res
}

// Switch the caller's active tenant. Members (and super-admins) only.
// Switching resets the active department so it never points into the old tenant.
export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const tenantId = (body.tenantId as string | undefined)?.trim()
  if (!tenantId) return badRequest("tenantId is required")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true },
  })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  if (!hasTenantAccess(profile, tenantId)) {
    return forbidden("You don't have access to this tenant.")
  }

  const res = NextResponse.json({ ok: true, slug: tenant.slug, id: tenant.id })
  applyActiveTenantCookies(res, tenant)
  return res
}
