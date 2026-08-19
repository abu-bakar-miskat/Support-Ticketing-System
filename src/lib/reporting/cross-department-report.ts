import "server-only";
import { prisma } from "@/lib/db";

export type CrossDepartmentBucket = {
  departmentId: string;
  departmentName: string;
  category: string;
  count: number;
};

/**
 * RPT-06: Project Admin's cross-department view — ticket counts by
 * department + the standard category taxonomy (D-08) only. Deliberately
 * never touches TicketMessage/Comment — only `Ticket.category`/`subDepartmentId`
 * counts are aggregated, so there is no code path here that could leak
 * message content into a cross-department report.
 */
export async function computeCrossDepartmentReport(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<CrossDepartmentBucket[]> {
  const rows = await prisma.ticket.groupBy({
    by: ["subDepartmentId", "category"],
    where: { tenantId, deletedAt: null, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];

  const subDepartmentIds = [...new Set(rows.map((r) => r.subDepartmentId))];
  const subDepartments = await prisma.subDepartment.findMany({
    where: { id: { in: subDepartmentIds } },
    select: { id: true, departmentId: true, department: { select: { name: true } } },
  });
  const subDepartmentToDept = new Map(
    subDepartments.map((t) => [t.id, { id: t.departmentId, name: t.department.name }]),
  );

  const byDeptCategory = new Map<string, CrossDepartmentBucket>();
  for (const r of rows) {
    const dept = subDepartmentToDept.get(r.subDepartmentId);
    if (!dept) continue;
    const category = r.category ?? "Uncategorized";
    const key = `${dept.id}:${category}`;
    const existing = byDeptCategory.get(key);
    if (existing) existing.count += r._count._all;
    else {
      byDeptCategory.set(key, {
        departmentId: dept.id,
        departmentName: dept.name,
        category,
        count: r._count._all,
      });
    }
  }
  return [...byDeptCategory.values()];
}
