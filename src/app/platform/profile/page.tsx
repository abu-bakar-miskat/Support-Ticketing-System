import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { PlatformProfilePage } from "@/components/platform/platform-profile-page"

export const dynamic = "force-dynamic"

export default async function PlatformProfileRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  const isTenantAdmin = (profile.tenantMemberships ?? []).some((m) => m.role === "admin")
  if (!profile.isSuperAdmin && !isTenantAdmin) redirect("/")

  return (
    <PlatformProfilePage
      name={profile.name}
      email={profile.email}
      avatarUrl={profile.avatarUrl}
      isSuperAdmin={profile.isSuperAdmin}
    />
  )
}
