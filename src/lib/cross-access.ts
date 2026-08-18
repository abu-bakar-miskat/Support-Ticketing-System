import "server-only";

import { prisma } from "@/lib/db";
import type { DeptScope, ProfileLike } from "@/lib/dept-scope";

type ProjectSubDepartmentRow = {
  subDepartmentId?: string | null;
  departmentId: string | null;
  subDepartment?: { departmentId: string | null } | null;
};

/** Effective department for a project row (direct field or via team). */
export function projectEffectiveDeptId(project: ProjectSubDepartmentRow): string | null {
  return project.departmentId ?? project.subDepartment?.departmentId ?? null;
}

/**
 * Resolve which team a new ticket should belong to for a project.
 * Legacy projects may have a null teamId, a deleted team reference, or a team
 * outside the project's department.
 */
export async function resolveSubDepartmentIdForProject(
  project: ProjectSubDepartmentRow,
  projectId?: string,
): Promise<string | null> {
  const deptId = projectEffectiveDeptId(project);

  async function pickExistingSubDepartmentId(
    candidates: Iterable<string | null | undefined>,
  ): Promise<string | null> {
    for (const id of candidates) {
      if (!id) continue;
      const subDepartment = await prisma.subDepartment.findUnique({
        where: { id },
        select: { id: true },
      });
      if (subDepartment) return subDepartment.id;
    }
    return null;
  }

  // Project team is valid when it exists and belongs to the project's department.
  if (project.subDepartmentId && deptId) {
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: project.subDepartmentId },
      select: { id: true, departmentId: true },
    });
    if (subDepartment?.departmentId === deptId) return subDepartment.id;
  } else if (project.subDepartmentId && !deptId) {
    const direct = await pickExistingSubDepartmentId([project.subDepartmentId]);
    if (direct) return direct;
  }

  // Prefer a real team in the project's department.
  if (deptId) {
    const deptSubDepartment = await prisma.subDepartment.findFirst({
      where: { departmentId: deptId },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    if (deptSubDepartment) return deptSubDepartment.id;
  }

  // Legacy projects — reuse a team that already hosts tickets for this project.
  if (projectId) {
    const ticketSubDepartments = await prisma.ticket.findMany({
      where: { projectId, deletedAt: null },
      select: { subDepartmentId: true },
      distinct: ["teamId"],
    });
    const fromTickets = await pickExistingSubDepartmentId(ticketSubDepartments.map((t) => t.subDepartmentId));
    if (fromTickets) return fromTickets;
  }

  // Last resort: project.teamId if the row still exists (even in another dept).
  return pickExistingSubDepartmentId([project.subDepartmentId]);
}

/**
 * When creating a ticket from a project board tab, honor the board's teamId for any
 * user with project access — not only admins/managers.
 */
export async function resolveBoardSubDepartmentForProjectTicket(
  project: ProjectSubDepartmentRow,
  projectId: string,
  requestedSubDepartmentId: string | null,
): Promise<string | null> {
  if (!requestedSubDepartmentId) return null;

  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: requestedSubDepartmentId },
    select: { id: true, departmentId: true },
  });
  if (!subDepartment) return null;

  if (project.subDepartmentId === requestedSubDepartmentId) return subDepartment.id;

  const deptId = projectEffectiveDeptId(project);
  if (deptId && subDepartment.departmentId === deptId) return subDepartment.id;

  const usedOnProject = await prisma.ticket.findFirst({
    where: { projectId, subDepartmentId: requestedSubDepartmentId, deletedAt: null },
    select: { id: true },
  });
  if (usedOnProject) return subDepartment.id;

  return null;
}

/** Project IDs the user is explicitly assigned to within a department workspace. */
export async function getAssignedProjectIdsInDept(
  userId: string,
  deptId: string,
): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: {
      userId,
      project: {
        OR: [{ departmentId: deptId }, { subDepartment: { departmentId: deptId } }],
      },
    },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

export async function isProjectMember(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const count = await prisma.projectMember.count({
    where: { projectId, userId },
  });
  return count > 0;
}

/** True when the user only has project-scoped (not full) cross-access to this department. */
export function isLimitedCrossAccessToDept(
  profile: ProfileLike,
  departmentId: string | null | undefined,
): boolean {
  if (!departmentId) return false;
  const granted = profile.grantedAccessDeptIds ?? [];
  const full = profile.fullAccessGrantedDeptIds ?? [];
  const direct = profile.directMemberDeptIds ?? [];
  const hasGrant = granted.includes(departmentId) || direct.includes(departmentId);
  return hasGrant && !full.includes(departmentId);
}

/** Prisma where: projects a user is assigned to within a specific department. */
export function assignedProjectsInDeptWhere(userId: string, deptId: string) {
  return {
    members: { some: { userId } },
    OR: [{ departmentId: deptId }, { subDepartment: { departmentId: deptId } }],
  };
}

/** Resolve a ticket's department from its team or project row. */
export async function resolveTicketDeptId(ticket: {
  projectId?: string | null;
  subDepartment?: { departmentId?: string | null } | null;
}): Promise<string | null> {
  if (ticket.subDepartment?.departmentId) return ticket.subDepartment.departmentId;
  if (!ticket.projectId) return null;
  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
    select: {
      departmentId: true,
      subDepartment: { select: { departmentId: true } },
    },
  });
  return project ? projectEffectiveDeptId(project) : null;
}

/**
 * Whether a cross-access guest may view/interact with a ticket (page-level check).
 * Uses the project's department when available so legacy team mismatches don't block access.
 */
export async function canCrossAccessGuestViewTicket(
  profile: ProfileLike,
  ticket: {
    projectId: string | null;
    subDepartmentId: string;
    subDepartment?: { departmentId?: string | null } | null;
    projectDeptId?: string | null;
  },
): Promise<boolean> {
  let deptId = ticket.projectDeptId ?? ticket.subDepartment?.departmentId ?? null;

  if (!deptId && ticket.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: ticket.projectId },
      select: {
        departmentId: true,
        subDepartment: { select: { departmentId: true } },
      },
    });
    if (project) deptId = projectEffectiveDeptId(project);
  }

  if (!deptId || !profile.id) return false;

  const full = profile.fullAccessGrantedDeptIds ?? [];
  if (full.includes(deptId)) return true;

  if (!isLimitedCrossAccessToDept(profile, deptId)) return false;
  if (!ticket.projectId) return false;

  return isProjectMember(profile.id, ticket.projectId);
}

/** Prisma ticket filter: project-scoped cross-access guests only see assigned projects. */
export function buildCrossAccessTicketFilter(
  profile: ProfileLike,
  deptScope: DeptScope,
): Record<string, unknown> | null {
  if (!deptScope?.isCrossAccessOnly || !profile.id) return null;
  return { project: assignedProjectsInDeptWhere(profile.id, deptScope.activeDeptId) };
}

type TicketEditFields = {
  assigneeId?: string | null;
  creatorId: string;
  subDepartmentId?: string;
  projectId?: string | null;
  subDepartment?: { departmentId?: string | null } | null;
  assignees?: ({ userId: string } | { user: { id: string } })[];
};

/** Build the context object for {@link canEditTicket} including project membership. */
export async function buildTicketEditContext(
  profile: ProfileLike,
  ticket: TicketEditFields,
) {
  const coAssigneeIds =
    ticket.assignees?.map((a) => ("userId" in a ? a.userId : a.user.id)) ?? [];
  const projectId = ticket.projectId ?? null;

  let departmentId = ticket.subDepartment?.departmentId ?? null;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        departmentId: true,
        subDepartment: { select: { departmentId: true } },
      },
    });
    if (project) {
      departmentId = projectEffectiveDeptId(project) ?? departmentId;
    }
  }

  return {
    assigneeId: ticket.assigneeId,
    creatorId: ticket.creatorId,
    coAssigneeIds,
    subDepartmentId: ticket.subDepartmentId ?? null,
    departmentId,
    projectId,
    viewerIsProjectMember:
      projectId != null && profile.id
        ? await isProjectMember(profile.id, projectId)
        : false,
  };
}
