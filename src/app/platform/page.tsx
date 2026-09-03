import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { readTenantBranding } from "@/lib/tenant-branding"
import { TenantsClient } from "@/components/platform/tenants-client"

export const dynamic = "force-dynamic"

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
      branding: true,
      _count: { select: { departments: true } },
    },
  })

  // A tenant's members span three tables: tenant admins/managers have a
  // TenantMembership, but sub-managers/agents are added via the sub-department
  // flow (SubDepartmentMembership) or directly to a department (DepartmentMember)
  // with NO TenantMembership. Count the DISTINCT union per tenant so the card
  // matches the member list on the tenant detail page — counting only
  // TenantMemberships undercounts to just the tenant admins.
  const [tenantMemberRows, subDeptMemberRows, directDeptMemberRows] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { isActive: true, user: { deletedAt: null } },
      select: { tenantId: true, userId: true },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { isActive: true, user: { deletedAt: null } },
      select: { userId: true, subDepartment: { select: { tenantId: true } } },
    }),
    prisma.departmentMember.findMany({
      where: { user: { deletedAt: null } },
      select: { userId: true, department: { select: { tenantId: true } } },
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
  for (const m of directDeptMemberRows) addMember(m.department?.tenantId, m.userId)

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
      members: memberIdsByTenant.get(t.id)?.size ?? 0,
    }
  })

  return <TenantsClient tenants={tenants} canManage={profile.isSuperAdmin} />
}
