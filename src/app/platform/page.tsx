import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { readTenantBranding } from "@/lib/tenant-branding"
import { TenantsClient } from "@/components/platform/tenants-client"

export const dynamic = "force-dynamic"

export const metadata = { title: "Tenants — Global Support Portal" }

export default async function TenantsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const rows = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      status: true,
      deletedAt: true,
      createdAt: true,
      branding: true,
      _count: { select: { departments: true } },
      // Current agreement — same "latest end date" rule as listTenantAgreementSummaries.
      agreements: {
        select: { endDate: true, renewalStatus: true },
        orderBy: { endDate: "desc" },
        take: 1,
      },
    },
  })

  // A tenant's members: tenant admins/managers have a TenantMembership; agents/
  // sub-managers join via SubDepartmentMembership. Count the DISTINCT union.
  const [tenantMemberRows, subDeptMemberRows] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { isActive: true, user: { deletedAt: null } },
      select: { tenantId: true, userId: true },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { isActive: true, user: { deletedAt: null } },
      select: { userId: true, subDepartment: { select: { tenantId: true } } },
    }),
  ])

  const memberIdsByTenant = new Map<string, Set<string>>()
  const addMember = (tenantId: string | null | undefined, userId: string) => {
    if (!tenantId) return
    const set = memberIdsByTenant.get(tenantId) ?? new Set<string>()
    set.add(userId)
    memberIdsByTenant.set(tenantId, set)
  }
  for (const m of tenantMemberRows) addMember(m.tenantId, m.userId)
  for (const m of subDeptMemberRows) addMember(m.subDepartment?.tenantId, m.userId)

  const tenants = rows.map((t) => {
    const b = readTenantBranding(t.branding)
    const agreement = t.agreements[0]
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      type: t.type,
      status: t.status,
      deleted: t.deletedAt != null,
      logoUrl: b.logoUrl ?? null,
      departments: t._count.departments,
      members: memberIdsByTenant.get(t.id)?.size ?? 0,
      agreementEndDate: agreement?.endDate.toISOString() ?? null,
      renewalStatus: agreement?.renewalStatus ?? null,
      createdAt: t.createdAt.toISOString(),
    }
  })

  return <TenantsClient tenants={tenants} canManage={profile.isSuperAdmin} />
}
