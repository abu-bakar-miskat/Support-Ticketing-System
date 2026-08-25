import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { resolveUserScope } from "@/lib/role-assignment"

const MAX_TAKE = 200

/**
 * Audit entries, viewable scoped to the caller's authority:
 *  - A platform admin may query any single tenant, OR omit tenantId to see
 *    every tenant at once ("All tenants" — the default platform view, so the
 *    log is never blank just because the first-alphabetical tenant is quiet).
 *  - A Project Admin (tenant-admin, see slice 18's D-06 mapping) may only query
 *    tenants they administer; omitting tenantId returns those tenants' events.
 *  - Everyone else is forbidden.
 * Read-only by design — there is no PATCH/DELETE on this resource, and the
 * DB-level trigger (see the immutability migration) blocks mutation even if
 * one were added by mistake.
 */
export async function GET(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const tenantId = sp.get("tenantId")

  const userScope = await resolveUserScope(profile!.id)

  // Resolve the set of tenants the caller may read, then intersect with any
  // requested tenantId. An empty (undefined) tenantFilter means "all tenants"
  // and is only ever produced for a platform admin.
  let tenantFilter: { in: string[] } | string | undefined
  if (tenantId) {
    const canView = userScope.isPlatformAdmin || userScope.tenantAdminIds.includes(tenantId)
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    tenantFilter = tenantId
  } else if (userScope.isPlatformAdmin) {
    tenantFilter = undefined // all tenants
  } else if (userScope.tenantAdminIds.length > 0) {
    tenantFilter = { in: userScope.tenantAdminIds }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const targetType = sp.get("targetType")
  const take = Math.min(Number(sp.get("take")) || 50, MAX_TAKE)
  const cursor = sp.get("cursor")

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
      ...(targetType ? { targetType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { tenant: { select: { id: true, name: true } } },
  })

  // actorId has no Prisma relation (same convention as Agreement.createdById,
  // AuditEvent's own design) so resolve display names with a side lookup.
  const actors = await prisma.profile.findMany({
    where: { id: { in: [...new Set(events.map((e) => e.actorId))] } },
    select: { id: true, name: true, email: true },
  })
  const actorById = new Map(actors.map((a) => [a.id, a]))

  return NextResponse.json({
    events: events.map((e) => ({ ...e, actor: actorById.get(e.actorId) ?? null })),
    nextCursor: events.length === take ? events[events.length - 1]?.id : null,
  })
}
