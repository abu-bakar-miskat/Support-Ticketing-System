import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import type { AuthProfile } from "@/lib/auth";
import type { ProfileMembership } from "@/lib/profile";

/**
 * Which slice of the ticket ActivityLog a feed should cover:
 *  - "active" — the caller's active department (the classic /activity behaviour).
 *  - "all"    — every department the caller can reach (tenant-wide for admins).
 *
 * The same resolver is used by the server page (initial render) and the
 * /api/activity route (Load-more), so both build an identical WHERE clause and
 * pagination never drifts out of scope.
 */
export type ActivityScopeKind = "active" | "all";

export type ResolvedActivityScope = {
  /** Sub-department ids the feed is bound to. Empty ⇒ tenant-wide (admin only). */
  subDepartmentIds: string[];
  /** Department ids in scope — used to build the member/project filter lists. */
  deptIds: string[];
  /** Active tenant, so a tenant-wide (empty subDepartmentIds) feed never spans tenants. */
  tenantId: string;
};

/** Every department id the profile can reach (managed, granted, direct, membership). */
function accessibleDeptIds(profile: AuthProfile): string[] {
  const managed = profile.managedDepartmentIds ?? [];
  const granted = profile.grantedAccessDeptIds ?? [];
  const direct = profile.directMemberDeptIds ?? [];
  const membership = ((profile.memberships ?? []) as ProfileMembership[])
    .map((m) => m.subDepartment?.department?.id)
    .filter((id): id is string => Boolean(id));
  return [...new Set([...managed, ...granted, ...direct, ...membership])];
}

export async function resolveActivityScope(
  profile: AuthProfile,
  kind: ActivityScopeKind,
): Promise<ResolvedActivityScope> {
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  if (kind === "active") {
    const deptScope = await getProfileDeptScope(profile);
    return {
      subDepartmentIds: deptScope?.subDepartmentIds ?? [],
      deptIds: deptScope?.activeDeptId ? [deptScope.activeDeptId] : [],
      tenantId,
    };
  }

  // kind === "all"
  // Admins get the whole tenant: an empty subDepartmentIds lets
  // buildActivityLogWhere bind by tenantId instead of by team.
  if (profile.role === "admin") {
    return { subDepartmentIds: [], deptIds: [], tenantId };
  }

  const deptIds = accessibleDeptIds(profile);
  if (deptIds.length === 0) {
    // No department access at all — fall back to the caller's own teams so the
    // feed is never accidentally tenant-wide for a non-admin.
    return { subDepartmentIds: profile.subDepartmentIds ?? [], deptIds: [], tenantId };
  }

  const subs = await prisma.subDepartment.findMany({
    where: { departmentId: { in: deptIds }, tenantId },
    select: { id: true },
  });
  return { subDepartmentIds: subs.map((s) => s.id), deptIds, tenantId };
}
