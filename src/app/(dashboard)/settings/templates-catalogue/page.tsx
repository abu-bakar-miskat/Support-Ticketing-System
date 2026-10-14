import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { listCatalogueForTenant } from "@/lib/template-catalogue"
import { getPlatformSettings } from "@/lib/platform-settings"
import { SettingsTemplatesCataloguePage } from "@/components/settings/settings-templates-catalogue-page"

export const dynamic = "force-dynamic"

export const metadata = { title: "Template Marketplace — Global Support Portal" }

export default async function TemplatesCataloguePage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  // Tenant Admin (role admin). Super Admin manages the catalogue from /platform/templates.
  if (profile.role !== "admin") redirect("/settings")

  const tenantId = profile.activeTenantId
  if (!tenantId) redirect("/settings")

  const [catalogue, settings] = await Promise.all([
    listCatalogueForTenant(tenantId),
    getPlatformSettings(),
  ])

  return (
    <SettingsTemplatesCataloguePage
      initialCatalogue={catalogue}
      approvalRequired={settings.templateEnablementRequiresApproval}
    />
  )
}
