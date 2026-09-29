import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { SettingsNotionImportPage } from "@/components/settings/settings-notion-import-page"

export const metadata = { title: "Import from Notion — Global Support Portal" }

export default async function SettingsImportRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  if (!isAdmin && !isManager) redirect("/settings")

  const subDepartments = await runAsSystem(() => prisma.subDepartment.findMany({
    where: { tenantId: profile.activeTenantId ?? "__no_tenant__" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  }))

  return <SettingsNotionImportPage subDepartments={subDepartments} />
}
