import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getTenantConfig } from "@/lib/tenant-config"
import { readTenantBranding } from "@/lib/tenant-branding"
import { SettingsBrandingPage } from "@/components/settings/settings-branding-page"

export const metadata = { title: "Branding — Settings — Support Ticketing System" }

export default async function SettingsBrandingRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  // Tenant-admins (role admin) and super-admins edit branding.
  const isTenantAdmin =
    profile.activeTenantId != null &&
    (profile.tenantMemberships ?? []).some(
      (m) => m.tenantId === profile.activeTenantId && m.role === "admin",
    )
  if (!profile.isSuperAdmin && profile.role !== "admin" && !isTenantAdmin) {
    redirect("/settings")
  }

  const tenant = profile.activeTenantId ? await getTenantConfig(profile.activeTenantId) : null

  return (
    <SettingsBrandingPage
      tenantName={tenant?.name ?? "Tenant"}
      initialBranding={readTenantBranding(tenant?.branding)}
    />
  )
}
