import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { PlatformTenantConfigurationPage } from "@/components/platform/platform-tenant-configuration-page"
import type { TenantTypeRow } from "@/components/platform/tenant-type-modal"

export const dynamic = "force-dynamic"

export const metadata = { title: "Tenant configuration — Global Support Portal" }

export default async function PlatformTenantConfigurationRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [tenants, rows, usage] = await Promise.all([
    prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, status: true },
    }),
    prisma.tenantType.findMany({
      orderBy: { label: "asc" },
      select: { id: true, key: true, label: true, description: true, createdAt: true },
    }),
    prisma.tenant.groupBy({
      by: ["type"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ])

  const usageByKey = new Map(usage.map((u) => [u.type, u._count._all]))
  const types: TenantTypeRow[] = rows.map((t) => ({
    id: t.id,
    key: t.key,
    label: t.label,
    description: t.description,
    tenants: usageByKey.get(t.key) ?? 0,
    createdAt: t.createdAt.toISOString(),
  }))

  return <PlatformTenantConfigurationPage tenants={tenants} types={types} />
}
