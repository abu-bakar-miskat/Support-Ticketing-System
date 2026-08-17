import { canManageProjects, type ProjectPermissionProfile } from "@/lib/project-permissions";

/**
 * Who can open the /modules area (sidebar route + rollup API):
 * admin/manager/lead, or a cross-access user with FULL access to the active department.
 * Staff and limited cross-access guests are excluded.
 */
export function canAccessModulesArea(
  profile: ProjectPermissionProfile,
  activeDeptId: string | null,
): boolean {
  if (canManageProjects(profile)) return true;
  return (
    !!activeDeptId &&
    (profile.fullAccessGrantedDeptIds ?? []).includes(activeDeptId)
  );
}

/** Who can create/edit/delete modules and set module status. */
export const canManageModules = canManageProjects;
