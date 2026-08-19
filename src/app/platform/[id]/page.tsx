import { redirect, notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { readTenantBranding } from "@/lib/tenant-branding"
import { TenantManageClient } from "@/components/tenants/tenant-manage-client"

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
  // /tenants list to enter their own tenant.
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
      _count: { select: { departments: true, memberships: true } },
    },
  })
  if (!tenant) notFound()

  const [memberRows, departmentRows] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }),
    prisma.department.findMany({
      where: { tenantId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])
  const members = memberRows.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl ?? null,
    role: m.role,
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
        members: tenant._count.memberships,
      }}
      initialBranding={readTenantBranding(tenant.branding)}
      initialMembers={members}
      departments={departmentRows}
    />
  )
}
