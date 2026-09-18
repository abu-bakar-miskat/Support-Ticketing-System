import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { reconcileProfileOnLogin } from "@/lib/reconcile-profile-on-login"
import { resolveActiveTenantId, getActiveTenantCookie } from "@/lib/tenant-scope"
import { X_TENANT_SLUG_HEADER } from "@/lib/tenant-path"
import { deriveEffectiveRole, type ScopeRow } from "@/lib/role-assignment"
import { tenantBlocksLogin } from "@/lib/tenant-lifecycle"
import { runAsSystem } from "@/lib/request-scope"

type AuthUser = {
  id: string
  email: string
  user_metadata: Record<string, unknown>
}

const PROFILE_TTL_MS = process.env.NODE_ENV === "test" ? 0 : 8_000
const globalForProfile = globalThis as unknown as {
  profileByUserId?: Map<string, { at: number; profile: object }>
  profileInflight?: Map<string, Promise<object | null>>
}
const profileByUserId = globalForProfile.profileByUserId ?? new Map()
const profileInflight = globalForProfile.profileInflight ?? new Map()
globalForProfile.profileByUserId = profileByUserId
globalForProfile.profileInflight = profileInflight

export type ProfileMembership = {
  subDepartmentId: string
  role: string
  nickname: string | null
  subDepartment: { id: string; name: string; prefix: string; department: { id: string; name: string; isHub: boolean } | null }
}

/** Fetch the profile row and all of its relation lists for a given auth id in one parallel batch. */
function loadProfileAndRelations(userId: string) {
  return runAsSystem(() =>
    Promise.all([
    prisma.profile.findUnique({ where: { id: userId } }),

    (prisma.subDepartmentMembership as any).findMany({
      where: { userId, isActive: true },
      select: {
        subDepartmentId: true,
        role: true,
        nickname: true,
        subDepartment: { select: { id: true, name: true, prefix: true, department: { select: { id: true, name: true, isHub: true } } } },
      },
    }).catch(() => [] as ProfileMembership[]),

    prisma.departmentManager.findMany({
      where: { userId },
      select: { departmentId: true, role: true, department: { select: { tenantId: true } } },
    }).catch(() => [] as { departmentId: string; role: string; department: { tenantId: string | null } | null }[]),

    prisma.departmentAccess.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { departmentId: true, fullAccess: true, department: { select: { tenantId: true } } },
    }).catch(() => [] as { departmentId: string; fullAccess: boolean; department: { tenantId: string | null } | null }[]),

    prisma.tenantMembership.findMany({
      where: { userId, isActive: true },
      select: {
        tenantId: true,
        role: true,
        tenant: { select: { status: true, deletedAt: true } },
      },
    }).catch(() => [] as { tenantId: string; role: string; tenant: { status: string; deletedAt: Date | null } }[]),
  ] as const),
  )
}

export const getProfile = cache(async () => {
  // DEV-ONLY auth bypass (see proxy.ts). Returns a synthetic admin so the app
  // renders without a live login. Guarded by DEV_AUTH_BYPASS — never enable in
  // production. Downstream DB queries by this id simply return empty lists.
  if (process.env.DEV_AUTH_BYPASS === "true") {
    const devId = "00000000-0000-0000-0000-000000000001"
    // Resolve real tenant memberships + active tenant so the dev super-admin can
    // switch tenants and see per-tenant isolation without a live login.
    const devTenants = await prisma.tenantMembership
      .findMany({ where: { userId: devId, isActive: true }, select: { tenantId: true, role: true } })
      .catch(() => [] as { tenantId: string; role: string }[])
    const devTenantIds = devTenants.map((t) => t.tenantId)
    const devActiveTenantId = await resolveActiveTenantId({
      id: devId,
      isSuperAdmin: true,
      tenantIds: devTenantIds,
    })
    return {
      id: devId,
      email: "dev@local.test",
      name: "Dev Admin",
      avatarUrl: null,
      role: "admin",
      subDepartmentId: null,
      createdAt: new Date(),
      timezone: null,
      location: null,
      githubUsername: null,
      isActive: true,
      isSuperAdmin: true,
      notificationPrefs: null,
      preferences: {},
      deletedAt: null,
      memberships: [] as ProfileMembership[],
      subDepartmentIds: [] as string[],
      managedDepartmentIds: [] as string[],
      departmentAdminIds: [] as string[],
      grantedAccessDeptIds: [] as string[],
      fullAccessGrantedDeptIds: [] as string[],
      directMemberDeptIds: [] as string[],
      isHubMember: false,
      tenantMemberships: devTenants,
      tenantIds: devTenantIds,
      activeTenantId: devActiveTenantId,
    }
  }

  const supabase = await createClient()
  // getClaims() verifies the JWT locally when the project uses asymmetric signing
  // keys (no Auth round-trip per navigation); it falls back to getUser() otherwise,
  // so this is never slower than a direct getUser() call.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (!claims?.sub || !claims.email) return null

  // Shape the claims into the minimal `user` object reconcile/relations expect.
  const user = {
    id: claims.sub,
    email: claims.email,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  }

  // The cross-request cache must key on the active-tenant context, not just the
  // user: `profile.activeTenantId` (and every tenant-scoped field derived from
  // it) depends on the active-tenant cookie / URL slug, which change when a
  // super-admin switches tenants. Keying by user id alone served the previous
  // tenant's profile for up to PROFILE_TTL_MS after a switch — the "still shows
  // the previous tenant" bug.
  const cacheKey = await activeTenantCacheKey(user.id)

  const cached = PROFILE_TTL_MS > 0 ? profileByUserId.get(cacheKey) : undefined
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) {
    return cached.profile as Awaited<ReturnType<typeof loadAuthedProfile>>
  }

  const inflight = profileInflight.get(cacheKey)
  if (inflight) return inflight as Promise<Awaited<ReturnType<typeof loadAuthedProfile>>>

  const pending = loadAuthedProfile(user).then((profile) => {
    if (profile && PROFILE_TTL_MS > 0) {
      profileByUserId.set(cacheKey, { at: Date.now(), profile })
    }
    return profile
  }).finally(() => {
    if (profileInflight.get(cacheKey) === pending) profileInflight.delete(cacheKey)
  })
  profileInflight.set(cacheKey, pending)
  return pending
})

/**
 * Cache key for the cross-request profile cache. Combines the user id with the
 * active-tenant context (URL slug from the proxy, then the active-tenant cookie)
 * so a tenant switch resolves to a different key and recomputes the profile
 * rather than returning the previous tenant's cached copy.
 */
async function activeTenantCacheKey(userId: string): Promise<string> {
  const [cookieTenant, headerList] = await Promise.all([getActiveTenantCookie(), headers()])
  const slug = (headerList.get(X_TENANT_SLUG_HEADER) ?? "").trim().toLowerCase()
  return `${userId}::${slug}::${cookieTenant ?? ""}`
}

const loadAuthedProfile = async (user: AuthUser) => {
    // Fetch the profile and its relations in one parallel batch. Reconciliation
    // already runs at login (auth/callback), so on the hot path this is the only
    // round-trip getProfile makes.
    let [profile, memberships, managedRaw, grantedRaw, tenantRaw] =
      await loadProfileAndRelations(user.id)

    // Self-heal only when the row is genuinely missing or soft-deleted: fresh
    // signup, admin-deleted restore, or auth-id migration. reconcile may move
    // relations onto the new id, so refetch the whole batch afterwards.
    if (!profile || profile.deletedAt) {
      await reconcileProfileOnLogin(user)
      ;[profile, memberships, managedRaw, grantedRaw, tenantRaw] =
        await loadProfileAndRelations(user.id)
    }

    if (!profile || profile.deletedAt) return null
    // SA-03: an individually restricted user is denied auth the same way a
    // soft-deleted one is — their data is untouched, only login is blocked.
    if (!profile.isActive) return null

    const typedManaged = managedRaw as { departmentId: string; role: string; department: { tenantId: string | null } | null }[]
    const typedGranted = grantedRaw as { departmentId: string; fullAccess: boolean; department: { tenantId: string | null } | null }[]

    const typedMemberships = memberships as ProfileMembership[]
    // True when the user belongs to at least one hub department
    const isHubMember = typedMemberships.some((m) => m.subDepartment?.department?.isHub === true)

    const rawTenantMemberships = tenantRaw as {
      tenantId: string
      role: string
      tenant: { status: string; deletedAt: Date | null }
    }[]
    // SA-01: a suspended/soft-deleted tenant's memberships don't count toward
    // access — filtered out here rather than in the query so a multi-tenant
    // user only loses the affected tenant(s), not their whole session.
    const tenantMemberships = rawTenantMemberships
      .filter((t) => !tenantBlocksLogin(t.tenant))
      .map((t) => ({ tenantId: t.tenantId, role: t.role }))
    const tenantIds = tenantMemberships.map((t) => t.tenantId)

    // Denied entirely only when every tenant they belong to is blocked — a
    // super-admin transcends tenant scope and is never denied this way.
    if (!profile.isSuperAdmin && rawTenantMemberships.length > 0 && tenantIds.length === 0) {
      return null
    }

    const activeTenantId = await resolveActiveTenantId({
      id: profile.id,
      isSuperAdmin: profile.isSuperAdmin,
      tenantIds,
    })

    // Tenant isolation: a user's admin/manager power applies only inside the
    // tenant they're currently acting in. `managedDepartmentIds`,
    // `departmentAdminIds`, department-access grants, and the derived `role` are
    // therefore scoped to the active tenant — an admin of tenant A must not gate
    // through as admin of a tenant-B department by supplying its id
    // (role-hierarchy.md). When no active tenant resolves (e.g. a super-admin who
    // hasn't entered one) we don't filter — their power derives from isSuperAdmin,
    // and there's no tenant context to leak into.
    const inActiveTenant = (tenantId: string | null | undefined): boolean =>
      !activeTenantId || tenantId === activeTenantId
    const activeManaged = typedManaged.filter((m) => inActiveTenant(m.department?.tenantId))
    const activeTenantMemberships = tenantMemberships.filter((t) => inActiveTenant(t.tenantId))

    const managedDepartmentIds = activeManaged.map((m) => m.departmentId)
    // Departments this user administers (DEPARTMENT-scoped Admin) — the subset of
    // managed departments with role=admin, within the active tenant. Grants
    // admin-only settings power for those departments (role-hierarchy.md).
    const departmentAdminIds = activeManaged
      .filter((m) => m.role === "admin")
      .map((m) => m.departmentId)
    const grantedAccessDeptIds = typedGranted
      .filter((g) => inActiveTenant(g.department?.tenantId))
      .map((g) => g.departmentId)
    const fullAccessGrantedDeptIds = typedGranted
      .filter((g) => g.fullAccess && inActiveTenant(g.department?.tenantId))
      .map((g) => g.departmentId)

    // Cross-department access is manager-level only. Agents/sub-managers use
    // SubDepartmentMembership for cross-sub-department collaboration.
    const canUseDepartmentAccess =
      profile.isSuperAdmin === true ||
      managedDepartmentIds.length > 0 ||
      activeTenantMemberships.some((t) => t.role === "admin")

    const scopedGrantedAccessDeptIds = canUseDepartmentAccess ? grantedAccessDeptIds : []
    const scopedFullAccessGrantedDeptIds = canUseDepartmentAccess ? fullAccessGrantedDeptIds : []

    // Authorization role comes from the canonical assignments (SRS D-06), not the
    // Profile.role column. Assemble the caller's assignment rows from the source
    // data already loaded above and derive the effective role — no extra query.
    const roleRows: ScopeRow[] = [
      ...(profile.isSuperAdmin
        ? [{ role: "admin" as const, scopeType: "PLATFORM" as const, scopeId: null }]
        : []),
      // A Super Admin who has switched into a tenant administers it as a tenant
      // admin (role-hierarchy.md — "Switch into a tenant for platform
      // administration"). Injecting a synthetic TENANT admin assignment for the
      // active tenant makes profile.role resolve to "admin" so every downstream
      // gate (requireAdmin, assertDepartmentAdmin, managerDeptScope, page views)
      // honors it — without granting power in tenants they haven't entered.
      ...(profile.isSuperAdmin && activeTenantId
        ? [{ role: "admin" as const, scopeType: "TENANT" as const, scopeId: activeTenantId }]
        : []),
      // Only the active tenant's memberships and managed departments feed the
      // effective role, so an admin/manager of another tenant doesn't resolve to
      // that role while acting here (tenant isolation, role-hierarchy.md).
      ...activeTenantMemberships.map((t) => ({
        role: t.role as ScopeRow["role"],
        scopeType: "TENANT" as const,
        scopeId: t.tenantId,
      })),
      ...activeManaged.map((m) => ({
        role: (m.role === "admin" ? "admin" : "manager") as ScopeRow["role"],
        scopeType: "DEPARTMENT" as const,
        scopeId: m.departmentId,
      })),
      ...scopedGrantedAccessDeptIds.map((id) => ({
        role: "agent" as const,
        scopeType: "DEPARTMENT" as const,
        scopeId: id,
      })),
      ...typedMemberships.map((m) => ({
        role: m.role as ScopeRow["role"],
        scopeType: "SUB_DEPARTMENT" as const,
        scopeId: m.subDepartmentId,
      })),
    ]
    const effectiveRole = deriveEffectiveRole(roleRows)

    return {
      ...profile,
      role: effectiveRole,
      memberships: typedMemberships,
      subDepartmentIds: typedMemberships.map((m) => m.subDepartmentId),
      managedDepartmentIds,
      departmentAdminIds,
      grantedAccessDeptIds: scopedGrantedAccessDeptIds,
      fullAccessGrantedDeptIds: scopedFullAccessGrantedDeptIds,
      // Kept for compatibility with older callers; always empty — membership is sub-department only.
      directMemberDeptIds: [] as string[],
      isHubMember,
      tenantMemberships,
      tenantIds,
      activeTenantId,
    }
}
