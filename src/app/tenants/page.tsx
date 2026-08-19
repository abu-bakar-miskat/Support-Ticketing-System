import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { readTenantBranding } from "@/lib/tenant-branding"
import { TenantsClient } from "@/components/tenants/tenants-client"

export const dynamic = "force-dynamic"

export default async function TenantsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  const adminTenantIds = (profile.tenantMemberships ?? [])
    .filter((m) => m.role === "admin")
    .map((m) => m.tenantId)
  if (!profile.isSuperAdmin && adminTenantIds.length === 0) redirect("/")

  const rows = await prisma.tenant.findMany({
    where: profile.isSuperAdmin ? undefined : { id: { in: adminTenantIds } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      status: true,
      deletedAt: true,
      branding: true,
      _count: { select: { departments: true, memberships: true } },
    },
  })

  const tenants = rows.map((t) => {
    const b = readTenantBranding(t.branding)
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      type: t.type,
      status: t.status,
      deleted: t.deletedAt != null,
      logoUrl: b.logoUrl ?? null,
      departments: t._count.departments,
      members: t._count.memberships,
    }
  })

  return <TenantsClient tenants={tenants} canManage={profile.isSuperAdmin} />
}
