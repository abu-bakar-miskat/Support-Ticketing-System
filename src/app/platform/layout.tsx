import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"
import { getProfile } from "@/lib/profile"
import { UserHydrator } from "@/components/providers/user-hydrator"
import { PlatformShell } from "@/components/platform/platform-shell"

export const dynamic = "force-dynamic"

/**
 * Tenant-selection layout, reachable by super admins (every tenant) and
 * tenant admins (their own tenants only). Super admins get a dedicated
 * platform-level shell (sidebar nav for Tenants / Templates / Activity /
 * Settings, plus a top bar with notifications/theme/account) since they have
 * several platform-wide pages to move between; tenant admins only ever see
 * their own tenant list here, so they keep the bare layout.
 */
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  const isTenantAdmin = (profile.tenantMemberships ?? []).some((m) => m.role === "admin")
  if (!profile.isSuperAdmin && !isTenantAdmin) redirect("/")

  return (
    <>
      <UserHydrator
        id={profile.id}
        email={profile.email}
        name={profile.name}
        avatarUrl={profile.avatarUrl}
        role={profile.role as Role}
        subDepartmentId={profile.subDepartmentId}
        subDepartmentIds={profile.subDepartmentIds}
        isSuperAdmin={profile.isSuperAdmin}
        memberships={(profile.memberships ?? []).map((m) => ({
          subDepartmentId: m.subDepartmentId,
          role: m.role,
        }))}
      />
      {profile.isSuperAdmin ? (
        <PlatformShell>{children}</PlatformShell>
      ) : (
        children
      )}
    </>
  )
}
