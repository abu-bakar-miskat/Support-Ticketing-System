import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, type ProfileLike } from "@/lib/dept-scope";

/**
 * Ticket predicate for the analytics dashboards.
 *
 * A selected department always wins: the query is that department's
 * sub-departments inside the active tenant. With no department selected,
 * a tenant admin sees every department of their tenant (`subDepartmentIds`
 * null) and the query is still bound to `tenantId`.
 */
export function analyticsTicketWhere(
  tenantId: string | null | undefined,
  subDepartmentIds: string[] | null,
): Record<string, unknown> {
  if (!tenantId) return { id: "__none__" };
  if (subDepartmentIds) {
    return {
      tenantId,
      subDepartmentId: { in: subDepartmentIds.length > 0 ? subDepartmentIds : ["__none__"] },
    };
  }
  return { tenantId };
}

export type AnalyticsScope = {
  ticketWhere: Record<string, unknown>;
  /** Null means every department in the tenant. */
  subDepartmentIds: string[] | null;
};

export async function resolveAnalyticsScope(
  profile: ProfileLike & { id: string; activeTenantId?: string | null },
  requestedDepartmentId: string | null,
): Promise<AnalyticsScope> {
  const tenantId = profile.activeTenantId ?? null;
  const deptScope = await getProfileDeptScope(profile);
  if (deptScope) {
    return {
      ticketWhere: analyticsTicketWhere(tenantId, deptScope.subDepartmentIds),
      subDepartmentIds: deptScope.subDepartmentIds,
    };
  }

  if (!tenantId || !requestedDepartmentId || requestedDepartmentId === "all") {
    return {
      ticketWhere: analyticsTicketWhere(tenantId, null),
      subDepartmentIds: null,
    };
  }

  const subs = await prisma.subDepartment.findMany({
    where: { departmentId: requestedDepartmentId, tenantId },
    select: { id: true },
  });
  const subDepartmentIds = subs.map((sub) => sub.id);
  return {
    ticketWhere: analyticsTicketWhere(tenantId, subDepartmentIds),
    subDepartmentIds,
  };
}
