import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"
import { getProfile } from "@/lib/profile"
import { getDashboardLayoutData } from "@/lib/dashboard-layout-data"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { UserHydrator } from "@/components/providers/user-hydrator"

export const dynamic = "force-dynamic"

/**
 * Platform-level layout for the super-admin tenants area. Renders the standard
 * dashboard shell (sidebar + top bar) so the "All Tenants" nav stays available,
 * but deliberately neutral — no per-tenant branding is applied here.
 */
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const layoutData = await getDashboardLayoutData(profile)

  return (
    <>
      <UserHydrator
        id={profile.id}
        email={profile.email}
        name={profile.name}
        avatarUrl={profile.avatarUrl}
        role={profile.role as Role}
        teamId={profile.teamId}
        teamIds={profile.teamIds}
        memberships={(profile.memberships ?? []).map((m) => ({
          teamId: m.teamId,
          role: m.role,
        }))}
      />
      {/* Neutral platform shell — no tenant branding on the /tenants area. */}
      <DashboardLayout initialLayoutData={layoutData}>{children}</DashboardLayout>
    </>
  )
}
