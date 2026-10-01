import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { resolveUserScope } from "@/lib/role-assignment"
import { runAsSystem } from "@/lib/request-scope"
import { auditTargetName, presentAuditPayload } from "@/lib/audit-display"
import { loadAuditLookups } from "@/lib/audit-display-data"

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
  const targetId = sp.get("targetId")
  const actorId = sp.get("actorId")
  const departmentId = sp.get("departmentId")
  const take = Math.min(Number(sp.get("take")) || 50, MAX_TAKE)
  const cursor = sp.get("cursor")

  // Optional inclusive date range. `from`/`to` are ISO date strings (YYYY-MM-DD
  // or full ISO). Invalid values are ignored rather than 400-ing so a stray
  // query param never blanks the log.
  const from = sp.get("from")
  const to = sp.get("to")
  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null
  const createdAtFilter: { gte?: Date; lte?: Date } = {}
  if (fromDate && !Number.isNaN(fromDate.getTime())) createdAtFilter.gte = fromDate
  if (toDate && !Number.isNaN(toDate.getTime())) createdAtFilter.lte = toDate

  const events = await prisma.auditEvent.findMany({
    where: {
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(createdAtFilter.gte || createdAtFilter.lte ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })

  // actorId/targetId/tenantId have no Prisma relation (same convention as
  // Agreement.createdById, AuditEvent's own design — tenantId lost its FK so
  // audit rows can outlive a purged tenant) so resolve display names with side
  // lookups. Targets are only named for Profile-typed events (user management)
  // — so "removed sub department member" shows WHO, not a raw id.
  const actorIds = events.map((e) => e.actorId)
  const targetProfileIds = events.filter((e) => e.targetType === "Profile").map((e) => e.targetId)
  const tenantIds = events.map((e) => e.tenantId).filter((id): id is string => id != null)
  const [profiles, tenants] = await Promise.all([
    prisma.profile.findMany({
      where: { id: { in: [...new Set([...actorIds, ...targetProfileIds])] } },
      select: { id: true, name: true, email: true },
    }),
    tenantIds.length > 0
      ? prisma.tenant.findMany({
          where: { id: { in: [...new Set(tenantIds)] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const lookups = await runAsSystem(() => loadAuditLookups(events))

  return NextResponse.json({
    events: events.map((e) => {
      const named = auditTargetName(e, lookups)
      return {
        ...e,
        before: presentAuditPayload(e.before, lookups),
        after: presentAuditPayload(e.after, lookups),
        actor: profileById.get(e.actorId) ?? null,
        target:
          e.targetType === "Profile"
            ? profileById.get(e.targetId) ?? null
            : named
              ? { id: e.targetId, name: named, email: null }
              : null,
        tenant: e.tenantId ? tenantById.get(e.tenantId) ?? null : null,
      }
    }),
    nextCursor: events.length === take ? events[events.length - 1]?.id : null,
  })
}
