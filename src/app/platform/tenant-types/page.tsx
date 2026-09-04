import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { TenantTypesClient } from "@/components/platform/tenant-types-client"

export const dynamic = "force-dynamic"

export default async function TenantTypesPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const rows = await prisma.tenantType.findMany({
    orderBy: { label: "asc" },
    select: { id: true, key: true, label: true, description: true },
  })

  // How many tenants currently use each type key — surfaced on each card and
  // used to block deletion of an in-use type.
  const usage = await prisma.tenant.groupBy({
    by: ["type"],
    where: { deletedAt: null },
    _count: { _all: true },
  })
  const usageByKey = new Map(usage.map((u) => [u.type, u._count._all]))

  const types = rows.map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    description: t.description,
    tenants: usageByKey.get(t.key) ?? 0,
  }))

  return <TenantTypesClient types={types} canManage={profile.isSuperAdmin} />
}
