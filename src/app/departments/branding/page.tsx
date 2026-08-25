import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getProfile } from "@/lib/profile"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { getTenantConfig } from "@/lib/tenant-config"
import { readTenantBranding } from "@/lib/tenant-branding"
import { SettingsBrandingPage } from "@/components/settings/settings-branding-page"

export const metadata = { title: "Branding — Departments — Support Ticketing System" }

export default async function DepartmentsBrandingRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  // Tenant-admins (role admin) and super-admins edit branding.
  const isTenantAdmin =
    profile.activeTenantId != null &&
    (profile.tenantMemberships ?? []).some(
      (m) => m.tenantId === profile.activeTenantId && m.role === "admin",
    )
  if (!profile.isSuperAdmin && profile.role !== "admin" && !isTenantAdmin) {
    redirect("/departments")
  }

  const isAdmin = profile.role === "admin"
  const profileScope = await getProfileDeptScope(profile)
  const activeDeptId = profileScope?.activeDeptId ?? null
  const managedDeptIds = [
    ...new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.grantedAccessDeptIds ?? []),
    ]),
  ]

  const tenantId = profile.activeTenantId ?? "__no_tenant__"
  const deptWhere = activeDeptId
    ? { id: activeDeptId }
    : isAdmin
      ? { tenantId }
      : { id: { in: managedDeptIds } }

  const [tenant, departments] = await Promise.all([
    profile.activeTenantId ? getTenantConfig(profile.activeTenantId) : Promise.resolve(null),
    isAdmin || managedDeptIds.length > 0
      ? prisma.department.findMany({
          where: deptWhere,
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  return (
    <SettingsBrandingPage
      tenantName={tenant?.name ?? "Tenant"}
      initialBranding={readTenantBranding(tenant?.branding)}
      departments={departments}
    />
  )
}
