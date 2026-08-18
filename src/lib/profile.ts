import "server-only"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { reconcileProfileOnLogin } from "@/lib/reconcile-profile-on-login"
import { resolveActiveTenantId } from "@/lib/tenant-scope"
import { deriveEffectiveRole, type ScopeRow } from "@/lib/role-assignment"

export type ProfileMembership = {
  subDepartmentId: string
  role: string
  nickname: string | null
  subDepartment: { id: string; name: string; prefix: string; department: { id: string; name: string; isHub: boolean } | null }
}

/** Fetch the profile row and all of its relation lists for a given auth id in one parallel batch. */
function loadProfileAndRelations(userId: string) {
  return Promise.all([
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
      select: { departmentId: true },
    }).catch(() => [] as { departmentId: string }[]),

    prisma.departmentAccess.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { departmentId: true, fullAccess: true },
    }).catch(() => [] as { departmentId: string; fullAccess: boolean }[]),

    prisma.departmentMember.findMany({
      where: { userId },
      select: { departmentId: true },
    }).catch(() => [] as { departmentId: string }[]),

    prisma.tenantMembership.findMany({
      where: { userId, isActive: true },
      select: { tenantId: true, role: true },
    }).catch(() => [] as { tenantId: string; role: string }[]),
  ] as const)
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

  try {
    // Fetch the profile and its relations in one parallel batch. Reconciliation
    // already runs at login (auth/callback), so on the hot path this is the only
    // round-trip getProfile makes.
    let [profile, memberships, managedRaw, grantedRaw, directMemberRaw, tenantRaw] =
      await loadProfileAndRelations(user.id)

    // Self-heal only when the row is genuinely missing or soft-deleted: fresh
    // signup, admin-deleted restore, or auth-id migration. reconcile may move
    // relations onto the new id, so refetch the whole batch afterwards.
    if (!profile || profile.deletedAt) {
      await reconcileProfileOnLogin(user)
      ;[profile, memberships, managedRaw, grantedRaw, directMemberRaw, tenantRaw] =
        await loadProfileAndRelations(user.id)
    }

    if (!profile || profile.deletedAt) return null

    const managedDepartmentIds = (managedRaw as { departmentId: string }[]).map((m) => m.departmentId)
    const grantedAccessDeptIds = (grantedRaw as { departmentId: string; fullAccess: boolean }[]).map((g) => g.departmentId)
    const fullAccessGrantedDeptIds = (grantedRaw as { departmentId: string; fullAccess: boolean }[])
      .filter((g) => g.fullAccess)
      .map((g) => g.departmentId)
    const directMemberDeptIds = (directMemberRaw as { departmentId: string }[]).map((m) => m.departmentId)

    const typedMemberships = memberships as ProfileMembership[]
    // True when the user belongs to at least one hub department
    const isHubMember = typedMemberships.some((m) => m.subDepartment?.department?.isHub === true)

    const tenantMemberships = tenantRaw as { tenantId: string; role: string }[]
    const tenantIds = tenantMemberships.map((t) => t.tenantId)
    const activeTenantId = await resolveActiveTenantId({
      id: profile.id,
      isSuperAdmin: profile.isSuperAdmin,
      tenantIds,
    })

    // Authorization role comes from the canonical assignments (SRS D-06), not the
    // Profile.role column. Assemble the caller's assignment rows from the source
    // data already loaded above and derive the effective role — no extra query.
    const roleRows: ScopeRow[] = [
      ...(profile.isSuperAdmin
        ? [{ role: "admin" as const, scopeType: "PLATFORM" as const, scopeId: null }]
        : []),
      ...tenantMemberships.map((t) => ({
        role: t.role as ScopeRow["role"],
        scopeType: "TENANT" as const,
        scopeId: t.tenantId,
      })),
      ...managedDepartmentIds.map((id) => ({
        role: "manager" as const,
        scopeType: "DEPARTMENT" as const,
        scopeId: id,
      })),
      ...directMemberDeptIds.map((id) => ({
        role: "staff" as const,
        scopeType: "DEPARTMENT" as const,
        scopeId: id,
      })),
      ...grantedAccessDeptIds.map((id) => ({
        role: "staff" as const,
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
      grantedAccessDeptIds,
      fullAccessGrantedDeptIds,
      directMemberDeptIds,
      isHubMember,
      tenantMemberships,
      tenantIds,
      activeTenantId,
    }
  } catch (error) {
    console.error("Failed to load profile:", error)
    throw error
  }
})
