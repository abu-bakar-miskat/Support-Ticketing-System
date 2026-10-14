import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { listTenantMailboxConnections } from "@/lib/mailbox-connection";
import { X_TENANT_SLUG_HEADER } from "@/lib/tenant-path";
import {
  DepartmentsMailboxes,
  type DepartmentMailboxUsage,
} from "@/components/departments/departments-mailboxes";

export const metadata = { title: "Mailboxes — Departments — Global Support Portal" };

export default async function DepartmentsMailboxesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/departments");

  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  // ── Per-department shared-mailbox usage (tenant-wide) ────────────────────
  const [depts, mailboxGroups, mailboxConnections, tenantMailboxes] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        subDepartments: {
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.mailboxConnection.groupBy({
      by: ["departmentId", "status"],
      where: { tenantId, authType: "OAUTH_M365", departmentId: { not: null } },
      _count: { _all: true },
      _max: { lastCheckedAt: true },
    }),
    prisma.mailboxConnection.findMany({
      where: { tenantId, authType: "OAUTH_M365", subDepartmentId: { not: null } },
      orderBy: { address: "asc" },
      select: { subDepartmentId: true, address: true, status: true, lastCheckedAt: true },
    }),
    profile.activeTenantId ? listTenantMailboxConnections(profile.activeTenantId) : Promise.resolve([]),
  ]);

  type DeptAgg = { total: number; active: number; issues: number; lastCheckedAt: Date | null };
  const mailboxByDept = new Map<string, DeptAgg>();
  for (const g of mailboxGroups) {
    if (!g.departmentId) continue;
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

  const mailboxesBySubDepartment = new Map<string, DepartmentMailboxUsage["subDepartments"][number]["mailboxes"]>();
  for (const mailbox of mailboxConnections) {
    if (!mailbox.subDepartmentId) continue;
    const entries = mailboxesBySubDepartment.get(mailbox.subDepartmentId) ?? [];
    entries.push({
      address: mailbox.address,
      status: mailbox.status,
      lastCheckedAt: mailbox.lastCheckedAt ? mailbox.lastCheckedAt.toISOString() : null,
    });
    mailboxesBySubDepartment.set(mailbox.subDepartmentId, entries);
  }

  // Sub-department pages are department-scoped, so their links must name the
  // department in the URL (/<tenant>/<dept>/…). A bare /sub-departments/… link
  // from this tenant-level page has no department context and the proxy
  // bounced it back to /<tenant>/departments (or to the cookie's department).
  const tenantSlug = (await headers()).get(X_TENANT_SLUG_HEADER);

  const rows: DepartmentMailboxUsage[] = depts.map((d) => {
    const u = mailboxByDept.get(d.id) ?? { total: 0, active: 0, issues: 0, lastCheckedAt: null };
    return {
      departmentId: d.id,
      name: d.name,
      basePath: tenantSlug ? `/${tenantSlug}/${d.slug}` : "",
      subDepartments: d.subDepartments.map((subDepartment) => ({
        ...subDepartment,
        mailboxes: mailboxesBySubDepartment.get(subDepartment.id) ?? [],
      })),
      total: u.total,
      active: u.active,
      issues: u.issues,
      lastCheckedAt: u.lastCheckedAt ? u.lastCheckedAt.toISOString() : null,
    };
  });

  return (
    <DepartmentsMailboxes
      rows={rows}
      tenantMailbox={tenantMailboxes[0] ? JSON.parse(JSON.stringify(tenantMailboxes[0])) : null}
    />
  );
}
