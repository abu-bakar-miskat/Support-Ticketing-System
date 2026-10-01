import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { TemplatesCatalogueAdmin } from "@/components/platform/templates-catalogue-admin"
import { ensureAvailableFeatureTemplates } from "@/lib/template-catalogue"

export const dynamic = "force-dynamic"

export default async function TemplatesCataloguePage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  await ensureAvailableFeatureTemplates(profile.id)

  const templateRows = await prisma.template.findMany({
    orderBy: { order: "asc" },
    include: { features: { select: { key: true } } },
  })

  const templates = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    isActive: t.isActive,
    featureKeys: t.features.map((f) => f.key),
    activeTenantCount: 0,
  }))

  return <TemplatesCatalogueAdmin initialTemplates={templates} />
}
