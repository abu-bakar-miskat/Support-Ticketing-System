import { prisma } from "@/lib/db"

/**
 * Filter options for the platform audit-log views (tenant + actor dropdowns).
 * `actorId` has no Prisma relation on AuditEvent, so actor names are resolved
 * with a side lookup. Shared by the Audit Log tab and the user-management
 * audit panels.
 */
export async function loadAuditFilterOptions(): Promise<{
  tenants: { id: string; name: string; slug: string }[]
  actors: { id: string; name: string | null; email: string }[]
}> {
  const [tenants, actorRows] = await Promise.all([
    prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.auditEvent.findMany({ distinct: ["actorId"], select: { actorId: true } }),
  ])

  const actors = await prisma.profile.findMany({
    where: { id: { in: actorRows.map((a) => a.actorId) } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  })

  return { tenants, actors }
}
