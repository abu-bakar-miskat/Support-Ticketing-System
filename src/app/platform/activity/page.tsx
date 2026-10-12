import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { AuditLog } from "@/components/audit/audit-log"

export const dynamic = "force-dynamic"

export const metadata = { title: "Audit log — Global Support Portal" }

export default async function PlatformActivityPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  // Filter option lists. Actors span both audit sources (ticket + admin), so
  // union the distinct actor ids and resolve their names once. Super admin, so
  // reads are unscoped anyway — runAsSystem keeps it explicit and consistent.
  const [tenants, departments, ticketActors, adminActors] = await runAsSystem(() =>
    Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.department.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.activityLog.findMany({ distinct: ["actorId"], select: { actorId: true } }),
      prisma.auditEvent.findMany({ distinct: ["actorId"], select: { actorId: true } }),
    ]),
  )

  const actorIds = [...new Set([...ticketActors.map((a) => a.actorId), ...adminActors.map((a) => a.actorId)])]
  const actorProfiles = await runAsSystem(() =>
    prisma.profile.findMany({
      where: { id: { in: actorIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  )

  return (
    <AuditLog
      scope="platform"
      tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      actors={actorProfiles.map((p) => ({ id: p.id, name: p.name ?? p.email }))}
    />
  )
}
