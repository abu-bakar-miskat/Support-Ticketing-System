import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import {
  DepartmentsMailboxes,
  type DepartmentMailboxUsage,
} from "@/components/departments/departments-mailboxes";

export const metadata = { title: "Mailboxes — Departments — Support Ticketing System" };

export default async function DepartmentsMailboxesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/departments");

  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  // ── Per-department shared-mailbox usage (tenant-wide) ────────────────────
  const [depts, mailboxGroups] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.mailboxConnection.groupBy({
      by: ["departmentId", "status"],
      where: { tenantId },
      _count: { _all: true },
      _max: { lastCheckedAt: true },
    }),
  ]);

  type DeptAgg = { total: number; active: number; issues: number; lastCheckedAt: Date | null };
  const mailboxByDept = new Map<string, DeptAgg>();
  for (const g of mailboxGroups) {
    const entry = mailboxByDept.get(g.departmentId) ?? { total: 0, active: 0, issues: 0, lastCheckedAt: null };
    const count = g._count._all;
    entry.total += count;
    if (g.status === "ACTIVE") entry.active += count;
    else entry.issues += count; // AUTH_ERROR + UNREACHABLE
    // Newest health check across this department's status groups.
    const checked = g._max.lastCheckedAt;
    if (checked && (!entry.lastCheckedAt || checked > entry.lastCheckedAt)) {
      entry.lastCheckedAt = checked;
    }
    mailboxByDept.set(g.departmentId, entry);
  }

  const rows: DepartmentMailboxUsage[] = depts.map((d) => {
    const u = mailboxByDept.get(d.id) ?? { total: 0, active: 0, issues: 0, lastCheckedAt: null };
    return {
      departmentId: d.id,
      name: d.name,
      total: u.total,
      active: u.active,
      issues: u.issues,
      lastCheckedAt: u.lastCheckedAt ? u.lastCheckedAt.toISOString() : null,
    };
  });

  return <DepartmentsMailboxes rows={rows} />;
}
