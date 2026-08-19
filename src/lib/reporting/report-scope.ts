import "server-only";
import { resolveUserScope } from "@/lib/role-assignment";
import { getProfileDeptScope, type ProfileLike } from "@/lib/dept-scope";

/**
 * RPT-07: every reporting query must be bound by the requester's scope.
 * "Project Admin" (D-06) is a tenant-admin `RoleAssignment` — not a distinct
 * role — who gets cross-department reporting instead of a department bound.
 * Platform admins get the same cross-department view, scoped to their
 * currently-active tenant (reports are always per-tenant, never global).
 */
export type ReportScope =
  | { kind: "cross_department"; tenantId: string }
  | { kind: "department"; subDepartmentIds: string[] }
  | { kind: "none" };

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
  if (deptScope) return { kind: "department", subDepartmentIds: deptScope.subDepartmentIds };

  return { kind: "none" };
}
