import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"
import { getProfile } from "@/lib/profile"
import { UserHydrator } from "@/components/providers/user-hydrator"

export const dynamic = "force-dynamic"

/**
 * Tenant-selection layout, reachable by super admins (every tenant) and
 * tenant admins (their own tenants only). Renders bare — no sidebar/top bar —
 * since tenant management sits outside the per-tenant dashboard chrome.
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
        memberships={(profile.memberships ?? []).map((m) => ({
          subDepartmentId: m.subDepartmentId,
          role: m.role,
        }))}
      />
      {children}
    </>
  )
}
