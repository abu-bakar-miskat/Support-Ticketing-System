import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { TemplatesCatalogueAdmin } from "@/components/tenants/templates-catalogue-admin"

export const dynamic = "force-dynamic"

export default async function TemplatesCataloguePage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [templateRows, requestRows] = await Promise.all([
    prisma.template.findMany({
      orderBy: { order: "asc" },
      include: {
        features: { select: { key: true } },
        _count: { select: { tenantTemplates: { where: { status: "ACTIVE" } } } },
      },
    }),
    prisma.templateRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        template: { select: { id: true, name: true } },
      },
    }),
  ])

  const requesterIds = [...new Set(requestRows.map((r) => r.requestedById))]
  const requesters = requesterIds.length
    ? await prisma.profile.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
    : []
  const requesterById = new Map(requesters.map((r) => [r.id, r]))

  const templates = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    isActive: t.isActive,
    featureKeys: t.features.map((f) => f.key),
    activeTenantCount: t._count.tenantTemplates,
  }))

  const requests = requestRows.map((r) => ({
    id: r.id,
    tenant: r.tenant,
    template: r.template,
    message: r.message,
    requestedAt: r.requestedAt.toISOString(),
    requestedBy: requesterById.get(r.requestedById) ?? null,
  }))

  return <TemplatesCatalogueAdmin initialTemplates={templates} initialRequests={requests} />
}
