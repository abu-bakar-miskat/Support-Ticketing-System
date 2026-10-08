import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { getPlatformSettings } from "@/lib/platform-settings"
import { getMailpitUiBase } from "@/lib/email-transport"
import { PlatformSettingsAdmin } from "@/components/platform/platform-settings-admin"

export const dynamic = "force-dynamic"

export default async function PlatformSettingsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [settings, tenantCount, suspendedCount, superAdminCount, templateCount, flagOverrides] =
    await Promise.all([
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

  return (
    <PlatformSettingsAdmin
      settings={settings}
      overview={overview}
      mailpitUiBase={getMailpitUiBase()}
    />
  )
}
