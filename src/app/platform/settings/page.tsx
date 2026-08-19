import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { PlatformSettingsAdmin } from "@/components/platform/platform-settings-admin"

export const dynamic = "force-dynamic"

export default async function PlatformSettingsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  })

  return <PlatformSettingsAdmin tenants={tenants} />
}
