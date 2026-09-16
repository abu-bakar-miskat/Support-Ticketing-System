import "server-only";
import { resolveSubDepartmentTeamIds } from "@/lib/role-assignment";
import { getProfileDeptScope } from "@/lib/dept-scope";

/**
 * SD-06: nested `notification.ticket` includes are not Prisma-extension
 * filtered. Drop tickets (or strip the ticket payload) that sit outside the
 * caller's sub-department allowlist.
 */
export { resolveSubDepartmentTeamIds };

/**
 * Notifications are always scoped to the caller's ACTIVE department (the
 * `pen_active_dept` cookie): the inbox/bell show only what's relevant to the
 * department you're currently in, and switch when you switch departments. When
 * no department is active (e.g. a tenant-level admin "global" view) fall back to
 * the caller's full sub-department membership so the inbox isn't blanked.
 */
export async function resolveNotificationScope(
  profile: Parameters<typeof getProfileDeptScope>[0] & { id: string },
): Promise<{ allowedSubDepartmentIds: string[] | null; activeDeptId: string | null }> {
  const deptScope = await getProfileDeptScope(profile);
  if (deptScope) {
    return {
      allowedSubDepartmentIds: deptScope.subDepartmentIds,
      activeDeptId: deptScope.activeDeptId,
    };
  }
  return {
    allowedSubDepartmentIds: await resolveSubDepartmentTeamIds(profile.id),
    activeDeptId: null,
  };
}

/** Whether a join-request notification belongs to the active department. */
export function joinRequestInDeptScope(
  departmentId: string | null | undefined,
  activeDeptId: string | null,
): boolean {
  if (activeDeptId == null) return true;
  return departmentId === activeDeptId;
}

export function ticketPayloadInScope(
  ticket: { subDepartmentId?: string | null } | null | undefined,
  allowedSubDepartmentIds: string[] | null,
): boolean {
  if (!ticket) return true;
  if (allowedSubDepartmentIds == null) return true;
  const subId = ticket.subDepartmentId ?? null;
  if (!subId) return false;
  return allowedSubDepartmentIds.includes(subId);
}
