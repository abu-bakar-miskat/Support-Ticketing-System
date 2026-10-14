import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"
import { getProfile } from "@/lib/profile"
import { UserHydrator } from "@/components/providers/user-hydrator"
import { PlatformShell } from "@/components/platform/platform-shell"
import { countPendingFeatureRequests } from "@/lib/feature-marketplace"
import { getPlatformSettings } from "@/lib/platform-settings"
import { PLATFORM_SIDEBAR_COLOR_DEFAULTS } from "@/lib/sidebar-colors"

export const dynamic = "force-dynamic"

/**
 * Platform-level layout, reachable by super admins only. Super admins get a
 * dedicated platform-level shell (sidebar nav for Tenants / Templates /
 * Activity / Settings, plus a top bar with notifications/theme/account) since
 * they have several platform-wide pages to move between. Tenant admins are
 * scoped to their own tenant and are not allowed into the platform area.
 */
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [pendingFeatureRequests, sidebarColors] = await Promise.all([
    countPendingFeatureRequests().catch(() => 0),
    getPlatformSettings()
      .then((s) => s.sidebarGroupColors)
      .catch(() => PLATFORM_SIDEBAR_COLOR_DEFAULTS),
  ])

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
      <PlatformShell pendingFeatureRequests={pendingFeatureRequests} sidebarColors={sidebarColors}>{children}</PlatformShell>
    </>
  )
}
