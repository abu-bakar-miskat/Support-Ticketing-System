import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ProfileLike } from "@/lib/dept-scope";
import { deptProjectsForDeptWhere } from "@/lib/dept-scope";

export { deptProjectsForDeptWhere } from "@/lib/dept-scope";

type Db = Prisma.TransactionClient | typeof prisma;

export type ProfileWithNativeDepts = ProfileLike & {
  memberships?: { subDepartment?: { department?: { id: string } | null } | null }[];
};

/** Prisma filter: the Support project for a department (kind + dept match). */
export function supportProjectsForDeptWhere(deptId: string) {
  return {
    kind: "support" as const,
    ...deptProjectsForDeptWhere(deptId),
  };
}

/** Department IDs the user natively belongs to or manages (not cross-access grants). */
export function getNativeDepartmentIds(profile: ProfileWithNativeDepts): string[] {
  const fromSubDepartments = (profile.memberships ?? [])
    .map((m) => m.subDepartment?.department?.id)
    .filter((id): id is string => !!id);
  return [
    ...new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.directMemberDeptIds ?? []),
      ...fromSubDepartments,
    ]),
  ];
}

/** True when the user is a native member or manager of the department (admins always). */
export function isNativeDeptMemberOrManager(
  profile: ProfileWithNativeDepts,
  departmentId: string,
): boolean {
  if (profile.role === "admin") return true;
  return getNativeDepartmentIds(profile).includes(departmentId);
}

/**
 * OR arm: all department projects for native members/managers.
 * Cross-access guests must remain on explicit ProjectMember assignments.
 */
export function nativeDeptProjectsVisibilityOr(
  profile: ProfileWithNativeDepts,
  deptId: string | null | undefined,
): ReturnType<typeof deptProjectsForDeptWhere> | null {
  if (!deptId || !isNativeDeptMemberOrManager(profile, deptId)) return null;
  return deptProjectsForDeptWhere(deptId);
}

/** @deprecated alias — prefer nativeDeptProjectsVisibilityOr / includeDeptProjectsForNativeMembers */
export function supportProjectVisibilityOr(
  profile: ProfileWithNativeDepts,
  deptId: string | null | undefined,
): ReturnType<typeof supportProjectsForDeptWhere> | null {
  if (!deptId || !isNativeDeptMemberOrManager(profile, deptId)) return null;
  return supportProjectsForDeptWhere(deptId);
}

/** Widen a project list filter so native dept users see every project in the department. */
export function includeDeptProjectsForNativeMembers(
  where: Record<string, unknown>,
  profile: ProfileWithNativeDepts,
  deptId: string | null | undefined,
): Record<string, unknown> {
  const deptOr = nativeDeptProjectsVisibilityOr(profile, deptId);
  if (!deptOr) return where;
  return { OR: [where, deptOr] };
}

/** Widen a project list filter so native dept users always see the Support project. */
export function includeSupportProjectForNativeMembers(
  where: Record<string, unknown>,
  profile: ProfileWithNativeDepts,
  deptId: string | null | undefined,
): Record<string, unknown> {
  return includeDeptProjectsForNativeMembers(where, profile, deptId);
}

/** True when the user may view a project as a native department member (read-only ok). */
export function hasNativeDeptProjectViewAccess(
  profile: ProfileWithNativeDepts,
  projectDeptId: string | null | undefined,
): boolean {
  return !!projectDeptId && isNativeDeptMemberOrManager(profile, projectDeptId);
}

export function supportProjectSlug(departmentId: string) {
  return `support-${departmentId}`;
}

/**
 * Returns the single Support project for a department.
 * Slug `support-{departmentId}` is the canonical key — one project per department.
 * Support projects only receive tickets from intake forms (no manual creation),
 * carry no lifecycle status and no live link.
 */
export async function resolveSupportProjectForDepartment(
  departmentId: string,
  db: Db = prisma,
): Promise<string> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true, tenantId: true },
  });
  if (!department) {
    throw new Error("Department not found");
  }

  const slug = supportProjectSlug(departmentId);

  const project = await db.project.upsert({
    where: { slug },
    update: {
      name: "Support",
      kind: "support",
      departmentId,
      projectStatus: null,
      projectUrl: null,
    },
    create: {
      name: "Support",
      slug,
      kind: "support",
      color: "#0ea5e9",
      departmentId,
      projectStatus: null,
      tenantId: department.tenantId,
    },
    select: { id: true },
  });

  // Merge tickets from legacy duplicate Support rows for this department.
  const legacy = await db.project.findMany({
    where: { kind: "support", departmentId, id: { not: project.id } },
    select: { id: true },
  });
  if (legacy.length > 0) {
    await db.ticket.updateMany({
      where: { projectId: { in: legacy.map((row) => row.id) } },
      data: { projectId: project.id },
    });
  }

  return project.id;
}

type SupportProjectRow = {
  id: string;
  kind: string;
  slug: string;
  departmentId: string | null;
};

/** Keep one Support row per department when listing projects. */
export function dedupeSupportProjects<T extends SupportProjectRow>(projects: T[]): T[] {
  const supportByDept = new Map<string, T>();
  const rest: T[] = [];

  for (const project of projects) {
    if (project.kind !== "support" || !project.departmentId) {
      rest.push(project);
      continue;
    }

    const canonicalSlug = supportProjectSlug(project.departmentId);
    const existing = supportByDept.get(project.departmentId);
    if (!existing) {
      supportByDept.set(project.departmentId, project);
      continue;
    }

    const projectIsCanonical = project.slug === canonicalSlug;
    const existingIsCanonical = existing.slug === canonicalSlug;
    if (projectIsCanonical && !existingIsCanonical) {
      supportByDept.set(project.departmentId, project);
    }
  }

  return [...rest, ...supportByDept.values()];
}
