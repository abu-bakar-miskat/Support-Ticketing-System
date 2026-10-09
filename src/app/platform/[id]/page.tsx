import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { readTenantBranding } from "@/lib/tenant-branding"
import { listAgreementsForTenant } from "@/lib/agreements"
import { TenantManageClient } from "@/components/platform/tenant-manage-client"

export const dynamic = "force-dynamic"

export default async function TenantManagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  // Branding/logo/status updates below are super-admin-only endpoints — keep
  // this page gated the same way, even though tenant admins can now reach the
  // /platform list to enter their own tenant.
  if (!profile.isSuperAdmin) redirect("/")

  const { id } = await params
  const tenant = await prisma.tenant.findUnique({
    where: { id },
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
  if (!tenant) notFound()

  // Members: tenant admins/managers via TenantMembership; agents/sub-managers via
  // SubDepartmentMembership. Union both so everyone shows.
  const [tenantMemberRows, subDeptMemberRows, departmentRows, agreements, tenantTypes] =
    await Promise.all([
      prisma.tenantMembership.findMany({
        where: { tenantId: id, isActive: true },
        select: { userId: true, createdAt: true },
      }),
      prisma.subDepartmentMembership.findMany({
        where: { isActive: true, subDepartment: { tenantId: id } },
        select: { userId: true, joinedAt: true },
      }),
      prisma.department.findMany({
        where: { tenantId: id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      listAgreementsForTenant(id),
      prisma.tenantType.findMany({
        orderBy: { label: "asc" },
        select: { id: true, key: true, label: true },
      }),
    ])

  const memberUserIds = [
    ...new Set([
      ...tenantMemberRows.map((m) => m.userId),
      ...subDeptMemberRows.map((m) => m.userId),
    ]),
  ]

  // When each person joined this tenant — the earliest of their memberships.
  const joinedAtByUser = new Map<string, Date>()
  const noteJoined = (userId: string, at: Date) => {
    const prev = joinedAtByUser.get(userId)
    if (!prev || at < prev) joinedAtByUser.set(userId, at)
  }
  for (const m of tenantMemberRows) noteJoined(m.userId, m.createdAt)
  for (const m of subDeptMemberRows) noteJoined(m.userId, m.joinedAt)

  const memberProfiles = await prisma.profile.findMany({
    where: { id: { in: memberUserIds }, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, avatarUrl: true, role: true, isActive: true },
  })

  const members = memberProfiles.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatarUrl ?? null,
    role: p.role,
    isActive: p.isActive,
    joinedAt: joinedAtByUser.get(p.id)?.toISOString() ?? null,
  }))

  return (
    <TenantManageClient
      tenant={{
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        type: tenant.type,
        status: tenant.status,
        deleted: tenant.deletedAt != null,
        departments: tenant._count.departments,
        members: members.length,
      }}
      initialBranding={readTenantBranding(tenant.branding)}
      initialMembers={members}
      departments={departmentRows}
      initialAgreements={agreements.map((a) => ({
        ...a,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        documents: a.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      }))}
      tenantTypes={tenantTypes}
    />
  )
}
