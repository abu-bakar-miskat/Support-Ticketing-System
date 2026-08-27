import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { PlatformActivityLog } from "@/components/platform/platform-activity-log"

export const dynamic = "force-dynamic"

export default async function PlatformActivityPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  })

  // Actor filter options: every profile that has authored an audited action.
  // actorId has no Prisma relation on AuditEvent, so resolve names separately.
  const actorRows = await prisma.auditEvent.findMany({
    distinct: ["actorId"],
    select: { actorId: true },
  })
  const actorProfiles = await prisma.profile.findMany({
    where: { id: { in: actorRows.map((a) => a.actorId) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  })

  return <PlatformActivityLog tenants={tenants} actors={actorProfiles} />
}
