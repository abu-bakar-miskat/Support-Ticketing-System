import type { ProfileLike } from "@/lib/dept-scope";

export type ProjectPermissionProfile = ProfileLike & {
  memberships?: { role: string }[];
};

export function hasSubDepartmentLeadRole(profile: ProjectPermissionProfile): boolean {
  return (profile.memberships ?? []).some((m) => m.role === "lead");
}

/** Profile role or active team membership role is lead. */
export function isProjectLead(profile: ProjectPermissionProfile): boolean {
  return profile.role === "lead" || hasSubDepartmentLeadRole(profile);
}

export function canManageProjectBoards(profile: ProjectPermissionProfile): boolean {
  return profile.role === "admin" || profile.role === "manager";
}

/**
 * Who may view the full lifecycle timeline and change project status / stages.
 * Staff and leads only see the current selected stage (read-only).
 */
export function canManageProjectLifecycle(profile: ProjectPermissionProfile): boolean {
  return profile.role === "admin" || profile.role === "manager";
}

export function canManageProjects(profile: ProjectPermissionProfile): boolean {
  return (
    profile.role === "admin" ||
    profile.role === "manager" ||
    isProjectLead(profile)
  );
}

export function canDeleteProjects(profile: ProjectPermissionProfile): boolean {
  return profile.role === "admin" || profile.role === "manager";
}

/** Full asset edit/delete (not add-only staff access). */
export function isPrivilegedProjectEditor(profile: ProjectPermissionProfile): boolean {
  return canManageProjects(profile);
}

/** Who may change project content (tickets, assets, settings fields) — managers/leads/admins or explicit members. */
export function canModifyProjectContent(
  profile: ProjectPermissionProfile,
  isProjectMember: boolean,
): boolean {
  if (canManageProjects(profile)) return true;
  return isProjectMember;
}

export const PROJECT_MODIFY_FORBIDDEN_MESSAGE =
  "You're not assigned to this project. Ask a project member or manager to add you before making changes.";

type ProjectSettingsAccessOpts = {
  projectDeptId: string | null;
  activeDeptId: string | null;
  isProjectMember: boolean;
};

/**
 * Who can open project settings (detail header / edit modal):
 * admin/manager/lead, explicit project members, or cross-access users with
 * full access to the project's department while in that department workspace.
 */
export function canAccessProjectSettings(
  profile: ProjectPermissionProfile,
  opts: ProjectSettingsAccessOpts,
): boolean {
  if (canManageProjects(profile)) return true;
  if (opts.isProjectMember) return true;
  return (
    !!opts.projectDeptId &&
    !!opts.activeDeptId &&
    opts.projectDeptId === opts.activeDeptId &&
    (profile.fullAccessGrantedDeptIds ?? []).includes(opts.activeDeptId)
  );
}
