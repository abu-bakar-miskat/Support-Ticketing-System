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
 * Resolve the active tenant for the client URL guard.
 *
 * - `?urlSlug=nishan` — the URL is the user's intent. If they can access that
 *   tenant, switch cookies to it (fixes /nishan showing VCAD data).
 * - No urlSlug — report the cookie tenant only. Never write cookies here: a
 *   stale in-flight GET must not overwrite a just-completed Enter POST.
 */
export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const urlSlug = (new URL(request.url).searchParams.get("urlSlug") ?? "")
    .trim()
    .toLowerCase()

  if (urlSlug) {
    const bySlug = await prisma.tenant.findFirst({
      where: { slug: urlSlug, deletedAt: null },
      select: { id: true, slug: true, name: true },
    })
    if (bySlug && hasTenantAccess(profile, bySlug.id)) {
      const cookieId = await getActiveTenantCookie()
      const switched = cookieId !== bySlug.id
      const res = NextResponse.json({
        tenant: { id: bySlug.id, slug: bySlug.slug, name: bySlug.name },
        switched,
      })
      if (switched) {
        applyActiveTenantCookies(res, bySlug)
      } else {
        // Id already correct — only re-assert the slug cookie (do not clear dept).
        res.cookies.set(TENANT_SLUG_COOKIE, bySlug.slug, COOKIE_BASE)
      }
      return res
    }
  }

  const cookieId = await getActiveTenantCookie()
  let tenantId: string | null = cookieId

  if (tenantId && !hasTenantAccess(profile, tenantId)) {
    tenantId = (profile.tenantIds ?? [])[0] ?? null
  }
  if (!tenantId && profile.isSuperAdmin) {
    const first = await prisma.tenant.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    tenantId = first?.id ?? null
  }
  if (!tenantId) {
    tenantId = (profile.tenantIds ?? [])[0] ?? null
  }
  if (!tenantId) return NextResponse.json({ tenant: null, switched: false })

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) return NextResponse.json({ tenant: null, switched: false })

  // Read-only: do not Set-Cookie. Callers that need a heal pass urlSlug.
  return NextResponse.json({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    switched: false,
  })
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
