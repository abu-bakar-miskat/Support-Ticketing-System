import "server-only";
import { resolveUserScope } from "@/lib/role-assignment";
import { getProfileDeptScope, type ProfileLike } from "@/lib/dept-scope";

/**
 * RPT-07: every reporting query must be bound by the requester's scope.
 * "Project Admin" (D-06) is a tenant-admin `RoleAssignment` — not a distinct
 * role — who gets cross-department reporting instead of a department bound.
 * Platform admins get that same per-tenant view only after they enter a
 * tenant. The cross-tenant volume report is a separate platform-admin query
 * (`canViewCrossTenantVolume`); it is not this scope, so a Tenant Admin
 * cannot reach other tenants through the normal report path (TC-039).
 */
export type ReportScope =
  | { kind: "cross_department"; tenantId: string }
  | { kind: "department"; tenantId: string; subDepartmentIds: string[] }
  | { kind: "none" };

/**
 * TC-038: only a platform Super Admin may aggregate ticket volume across
 * tenants. A Tenant Admin (`isPlatformAdmin` false) stays on their own tenant.
 */
export function canViewCrossTenantVolume(actor: {
  isPlatformAdmin?: boolean;
  isSuperAdmin?: boolean;
}): boolean {
  return actor.isPlatformAdmin === true || actor.isSuperAdmin === true;
}

/**
 * Predicate merged into every report ticket query. Department scope always
 * includes `tenantId` so a `runAsSystem` report cannot bleed across tenants
 * when the Prisma tenant extension is bypassed.
 */
export function reportScopeWhere(scope: ReportScope): Record<string, unknown> {
  if (scope.kind === "department") {
    if (!scope.tenantId) return { id: "__none__" };
    return { tenantId: scope.tenantId, subDepartmentId: { in: scope.subDepartmentIds } };
  }
  if (scope.kind === "cross_department") {
    if (!scope.tenantId) return { id: "__none__" };
    return { tenantId: scope.tenantId };
  }
  return { id: "__none__" };
}

export async function resolveReportScope(
  profile: ProfileLike & { id: string; activeTenantId?: string | null },
): Promise<ReportScope> {
  const userScope = await resolveUserScope(profile.id);
  const activeTenantId = profile.activeTenantId ?? null;

  if (userScope.isPlatformAdmin) {
    return activeTenantId ? { kind: "cross_department", tenantId: activeTenantId } : { kind: "none" };
  }
  if (activeTenantId && userScope.tenantAdminIds.includes(activeTenantId)) {
    return { kind: "cross_department", tenantId: activeTenantId };
  }

  const deptScope = await getProfileDeptScope(profile);
  // No active tenant → match nothing. A department id list alone is not a
  // tenant bound, and report queries run outside the Prisma tenant extension.
  if (deptScope && activeTenantId) {
    return { kind: "department", tenantId: activeTenantId, subDepartmentIds: deptScope.subDepartmentIds };
  }

  return { kind: "none" };
}
