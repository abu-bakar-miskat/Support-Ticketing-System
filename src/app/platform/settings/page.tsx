import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { getPlatformSettings } from "@/lib/platform-settings"
import { PlatformSettingsAdmin } from "@/components/platform/platform-settings-admin"

export const dynamic = "force-dynamic"

export default async function PlatformSettingsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [tenants, settings, tenantCount, suspendedCount, superAdminCount, templateCount, flagOverrides] =
    await Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true, status: true },
      }),
      getPlatformSettings(),
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { deletedAt: null, status: "suspended" } }),
      prisma.profile.count({ where: { isSuperAdmin: true, deletedAt: null } }),
      prisma.template.count({ where: { isActive: true } }),
      prisma.featureFlag.count({ where: { enabled: false } }),
    ])

  const overview = {
    tenants: tenantCount,
    suspended: suspendedCount,
    superAdmins: superAdminCount,
    activeTemplates: templateCount,
    disabledFlags: flagOverrides,
  }

  return <PlatformSettingsAdmin tenants={tenants} settings={settings} overview={overview} />
}
