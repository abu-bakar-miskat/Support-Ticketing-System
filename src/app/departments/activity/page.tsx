import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { resolveActivityScope } from "@/lib/activity-scope";
import { AuditLog } from "@/components/audit/audit-log";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Log — Global Support Portal" };

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // "all" scope = every department the caller can reach (tenant-wide for admins).
  const scope = await resolveActivityScope(profile, "all");
  const tenantId = scope.tenantId;

  // Filter option lists — where clauses are already bound to the caller's scope,
  // so run unscoped to avoid the ticket-scope extension waterfall.
  const [departments, actorProfiles] = await runAsSystem(() =>
    Promise.all([
      prisma.department.findMany({
        where: scope.deptIds.length > 0 ? { id: { in: scope.deptIds } } : { tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.profile.findMany({
        where: { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]),
  );

  return (
    <AuditLog
      scope="department"
      actors={actorProfiles.map((p) => ({ id: p.id, name: p.name }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
