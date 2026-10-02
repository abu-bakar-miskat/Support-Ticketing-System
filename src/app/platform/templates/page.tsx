import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { TemplatesCatalogueAdmin } from "@/components/platform/templates-catalogue-admin"
import { OPERATION_TEMPLATES } from "@/lib/operation-templates"
import { isSystemTemplateSlug } from "@/lib/system-templates"
import { ASSIGNMENT_METHOD_LABELS } from "@/lib/feature-setup"
import { ensureDefaultFeatureTemplates, listSavedFeatures } from "@/lib/saved-features"
import { ensureAvailableFeatureTemplates } from "@/lib/template-catalogue"

export const dynamic = "force-dynamic"

export default async function TemplatesCataloguePage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  await ensureAvailableFeatureTemplates(profile.id)
  await ensureDefaultFeatureTemplates(profile.id)

  const templateRows = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
    include: { features: { select: { key: true } } },
  })

  const savedBySlug = new Map((await listSavedFeatures()).map((feature) => [feature.id, feature]))
  const operationSlugs = new Set(OPERATION_TEMPLATES.map((operation) => operation.slug))
  const templates = templateRows.filter((t) => !operationSlugs.has(t.slug) && !isSystemTemplateSlug(t.slug)).map((t) => {
    const saved = savedBySlug.get(t.slug)
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      isActive: t.isActive,
      featureKeys: t.features.map((f) => f.key),
      activeTenantCount: 0,
      setup: saved
        ? {
            key: saved.key,
            statuses: saved.statuses.map((status) => ({
              label: status.label,
              color: status.color,
              isComplete: status.isComplete,
            })),
            lists: saved.lists,
            tags: saved.tags,
            sla: saved.sla,
            ticketTemplates: saved.ticketTemplates,
            assignmentLabel: saved.key === "assignmentMethods" ? ASSIGNMENT_METHOD_LABELS[saved.assignmentMethod] : null,
            supportForm:
              saved.key === "supportForm" && (saved.supportForm.name || saved.supportForm.fields.length > 0)
                ? { name: saved.supportForm.name, fields: saved.supportForm.fields.map((field) => field.label) }
                : null,
            calendar:
              saved.key === "calendar"
                ? `${saved.calendar.workingDays.map((day) => days[day]).filter(Boolean).join(", ")} ${saved.calendar.start}–${saved.calendar.end}`
                : null,
            reportsPeriodDays: saved.key === "reports" ? saved.reportsPeriodDays : null,
          }
        : null,
    }
  })

  return <TemplatesCatalogueAdmin initialTemplates={templates} />
}
