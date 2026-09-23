import "server-only";
import { prisma } from "@/lib/db";

export type TenantVolumeRow = {
  tenantId: string;
  tenantName: string;
  count: number;
};

export type TenantDepartmentRow = {
  departmentId: string;
  departmentName: string;
  count: number;
};

export type TenantTicketRow = {
  id: string;
  tenantId: string;
  humanId: string;
  title: string;
  status: string;
  type: string;
  category: string;
  createdAt: Date;
};

function windowWhere(start: Date, end: Date) {
  return {
    deletedAt: null,
    createdAt: { gte: start, lt: end },
  };
}

/**
 * TC-038: ticket counts per tenant for [start, end). The date window and
 * soft-delete filter are in the query, not applied after the rows come back.
 * Tenants with no tickets in the window are returned with count 0 so a
 * missing bucket cannot be mistaken for "not aggregated".
 */
export async function computeCrossTenantVolumeReport(
  start: Date,
  end: Date,
): Promise<TenantVolumeRow[]> {
  const [rows, tenants] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["tenantId"],
      where: windowWhere(start, end),
      _count: { _all: true },
    }),
    prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const counts = new Map(rows.map((row) => [row.tenantId, row._count._all]));
  return tenants
    .map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      count: counts.get(tenant.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.tenantName.localeCompare(b.tenantName));
}

/**
 * Department totals inside one tenant. Both the ticket group and the
 * sub-department lookup are constrained to `tenantId`.
 */
export async function computeTenantDepartmentVolume(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<TenantDepartmentRow[]> {
  if (!tenantId) return [];

  const rows = await prisma.ticket.groupBy({
    by: ["subDepartmentId"],
    where: { tenantId, ...windowWhere(start, end) },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];

  const subDepartments = await prisma.subDepartment.findMany({
    where: { id: { in: rows.map((row) => row.subDepartmentId) }, tenantId },
    select: { id: true, departmentId: true, department: { select: { name: true } } },
  });
  const bySub = new Map(subDepartments.map((sub) => [sub.id, sub]));
  const byDept = new Map<string, TenantDepartmentRow>();
  for (const row of rows) {
    const sub = bySub.get(row.subDepartmentId);
    if (!sub?.departmentId) continue;
    const existing = byDept.get(sub.departmentId);
    if (existing) existing.count += row._count._all;
    else {
      byDept.set(sub.departmentId, {
        departmentId: sub.departmentId,
        departmentName: sub.department?.name ?? "Department",
        count: row._count._all,
      });
    }
  }
  return [...byDept.values()].sort(
    (a, b) => b.count - a.count || a.departmentName.localeCompare(b.departmentName),
  );
}

/**
 * Drill-down for one tenant. `tenantId` is an equality predicate on the
 * query itself. Rows that do not match that id are dropped before return,
 * so a widened query cannot leak another tenant into the response.
 */
export async function computeCrossTenantTicketDrilldown(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<TenantTicketRow[]> {
  if (!tenantId) return [];

  const rows = await prisma.ticket.findMany({
    where: {
      tenantId,
      ...windowWhere(start, end),
    },
    select: {
      id: true,
      tenantId: true,
      ticketNumber: true,
      title: true,
      status: true,
      type: true,
      category: true,
      createdAt: true,
      subDepartment: { select: { prefix: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows
    .filter((row) => row.tenantId === tenantId)
    .map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      humanId: row.subDepartment?.prefix
        ? `${row.subDepartment.prefix}-${row.ticketNumber}`
        : String(row.ticketNumber),
      title: row.title,
      status: row.status,
      type: row.type,
      category: row.category ?? "Uncategorized",
      createdAt: row.createdAt,
    }));
}
