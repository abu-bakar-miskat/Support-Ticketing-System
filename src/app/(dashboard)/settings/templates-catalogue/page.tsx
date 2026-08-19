import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { listCatalogueForTenant } from "@/lib/template-catalogue"
import { SettingsTemplatesCataloguePage } from "@/components/settings/settings-templates-catalogue-page"

export const dynamic = "force-dynamic"

export default async function TemplatesCataloguePage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin") redirect("/settings")

  const catalogue = await listCatalogueForTenant(profile.activeTenantId ?? "__no_tenant__")

  return <SettingsTemplatesCataloguePage initialCatalogue={catalogue} />
}
