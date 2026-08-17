import { prisma } from "@/lib/db";
import { projectInScope } from "@/lib/dept-scope";
import type { ProjectAsset } from "@/lib/api/projects";
import {
  isPrivilegedProjectEditor,
  type ProjectPermissionProfile,
} from "@/lib/project-permissions";
import { isProjectMember } from "@/lib/cross-access";

export { isPrivilegedProjectEditor } from "@/lib/project-permissions";

export async function canAddProjectAssets(
  profile: ProjectPermissionProfile,
  projectId: string,
  isProjectMemberRow?: boolean,
): Promise<boolean> {
  if (!(await projectInScope(profile, projectId))) return false;
  const isMember =
    isProjectMemberRow ??
    (profile.id ? await isProjectMember(profile.id, projectId) : false);
  if (!isMember && !isPrivilegedProjectEditor(profile)) return false;
  return isPrivilegedProjectEditor(profile) || profile.role === "staff";
}

export function canDeleteProjectAssets(profile: ProjectPermissionProfile) {
  return isPrivilegedProjectEditor(profile);
}

/** Staff may add/update nodes but not remove existing ones. */
export function assetsUpdateAllowedForStaff(
  previous: ProjectAsset[],
  next: ProjectAsset[],
): boolean {
  const nextIds = new Set(next.map((a) => a.id));
  return previous.every((a) => nextIds.has(a.id));
}
