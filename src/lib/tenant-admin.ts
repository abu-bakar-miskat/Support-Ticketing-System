export type TenantAdminProfile = {
  isSuperAdmin?: boolean
  activeTenantId?: string | null
  tenantMemberships?: Array<{ tenantId: string; role: string }>
}

/** Tenant-wide administration, distinct from an Admin assignment on one department. */
export function isActiveTenantAdmin(profile: TenantAdminProfile): boolean {
  if (profile.isSuperAdmin) return true
  if (!profile.activeTenantId) return false
  return (profile.tenantMemberships ?? []).some(
    (membership) =>
      membership.tenantId === profile.activeTenantId && membership.role === "admin",
  )
}
