import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, getPersonalTaskDeptScope, resolveStatusSubDepartmentId } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { assignedProjectsInDeptWhere } from "@/lib/cross-access";
import {
  getBoardCards,
  getSubDepartmentReviewCards,
  getAssignedSubtasks,
  getSubDepartmentStatusesForSubDepartmentIds,
  getSubDepartmentStatuses,
} from "@/lib/board-data";
import type { MyTasksResponse, TasksMetaResponse } from "@/lib/api/tasks";
import type { getProfile } from "@/lib/profile";

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export async function getMyTasksData(profile: Profile): Promise<MyTasksResponse> {
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isMgrOrAdmin = isAdmin || isManager;

  const deptScope = await getProfileDeptScope(profile);
  const personalTaskScope = await getPersonalTaskDeptScope(profile);

  let managedSubDepartmentIds: string[] = [];
  if (isMgrOrAdmin) {
    if (deptScope?.subDepartmentIds?.length) {
      managedSubDepartmentIds = deptScope.subDepartmentIds;
    } else {
      const allowedDeptIds = [
        ...(profile.managedDepartmentIds ?? []),
        ...(profile.grantedAccessDeptIds ?? []),
      ];
      if (allowedDeptIds.length > 0) {
        const subDepartments = await prisma.subDepartment.findMany({
          where: { departmentId: { in: allowedDeptIds } },
          select: { id: true },
        });
        managedSubDepartmentIds = subDepartments.map((t) => t.id);
      }
    }
  }

  const [myCards, reviewCards, subtasks] = await Promise.all([
    getBoardCards({
      assigneeId: profile.id,
      ...(profile.activeTenantId ? { tenantId: profile.activeTenantId } : {}),
      ...(personalTaskScope ? { allowedDeptIds: personalTaskScope.allowedDeptIds } : {}),
      timeForUserId: profile.id,
    }),
    isMgrOrAdmin ? getSubDepartmentReviewCards(managedSubDepartmentIds, profile.id) : Promise.resolve([]),
    getAssignedSubtasks(
      profile.id,
      personalTaskScope ? { allowedDeptIds: personalTaskScope.allowedDeptIds } : {},
    ),
  ]);

  const subDepartmentIds = [...new Set(myCards.map((c) => c.subDepartmentId))];
  const subDepartmentStatusMap = await getSubDepartmentStatusesForSubDepartmentIds(subDepartmentIds);

  return {
    tasks: myCards,
    subtasks,
    reviewTasks: reviewCards,
    isManager: isMgrOrAdmin,
    subDepartmentStatusMap: Object.fromEntries(subDepartmentStatusMap),
  };
}

export async function getTasksMetaData(
  profile: Profile,
  activeDeptId?: string | null,
): Promise<TasksMetaResponse> {
  const cookieStore = await cookies();
  const cookieSubDepartmentId = cookieStore.get("pen_active_team")?.value ?? null;
  const membershipIds = profile.subDepartmentIds ?? [];

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  const deptScope = await getProfileDeptScope(profile);

  const statusSubDepartmentId = resolveStatusSubDepartmentId({
    deptScope,
    cookieSubDepartmentId,
    membershipIds,
    primarySubDepartmentId: profile.subDepartmentId,
  });

  const projectsPromise = (async () => {
    if (deptScope?.isCrossAccessOnly && profile.id) {
      return prisma.project.findMany({
        where: assignedProjectsInDeptWhere(profile.id, deptScope.activeDeptId),
        select: { id: true, name: true, subDepartmentId: true, kind: true },
        orderBy: { name: "asc" },
      });
    }

    if (deptScope?.activeDeptId) {
      const scopedDeptId = deptScope.activeDeptId;
      return prisma.project.findMany({
        where: {
          OR: [
            { departmentId: scopedDeptId },
            { subDepartment: { departmentId: scopedDeptId } },
          ],
        },
        select: { id: true, name: true, subDepartmentId: true, kind: true },
        orderBy: { name: "asc" },
      });
    }

    if (isAdmin || isManager) {
      const allowedDeptIds = [
        ...new Set([
          ...(profile.managedDepartmentIds ?? []),
          ...(profile.grantedAccessDeptIds ?? []),
        ]),
      ];

      if (allowedDeptIds.length > 0) {
        return prisma.project.findMany({
          where: {
            OR: [
              { departmentId: { in: allowedDeptIds } },
              { subDepartment: { departmentId: { in: allowedDeptIds } } },
            ],
          },
          select: { id: true, name: true, subDepartmentId: true, kind: true },
          orderBy: { name: "asc" },
        });
      }
      if (isAdmin) {
        return prisma.project.findMany({
          select: { id: true, name: true, subDepartmentId: true, kind: true },
          orderBy: { name: "asc" },
        });
      }
      return [];
    }
    if (profile.role === "lead" && profile.subDepartmentId) {
      return prisma.project.findMany({
        where: { subDepartmentId: profile.subDepartmentId },
        select: { id: true, name: true, subDepartmentId: true, kind: true },
        orderBy: { name: "asc" },
      });
    }
    const memberships = await prisma.projectMember.findMany({
      where: { userId: profile.id },
      select: { project: { select: { id: true, name: true, subDepartmentId: true, kind: true } } },
    });
    return memberships.map((m) => m.project);
  })();

  // Modules depend on projects; members and statuses are independent —
  // pipeline modules behind projects and run everything concurrently.
  const modulesPromise = projectsPromise.then(async (availableProjects) =>
    availableProjects.length === 0
      ? []
      : (
          await prisma.projectModule.findMany({
            where: {
              projectId: { in: availableProjects.map((p) => p.id) },
              project: { moduleSystemEnabled: true },
            },
            select: {
              id: true,
              name: true,
              projectId: true,
              project: { select: { name: true } },
            },
            orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
          })
        ).map((m) => ({
          id: m.id,
          name: m.name,
          projectId: m.projectId,
          projectName: m.project.name,
        })),
  );

  const membersPromise = (async () => {
    const deptId = activeDeptId ?? deptScope?.activeDeptId ?? null;

    if (!deptId && profile.subDepartmentId) {
      const subDepartment = await prisma.subDepartment.findUnique({
        where: { id: profile.subDepartmentId },
        select: { departmentId: true },
      });
      return fetchProjectDepartmentPeople(subDepartment?.departmentId ?? null);
    }

    if (!deptId) return [];

    return fetchProjectDepartmentPeople(deptId);
  })();

  const [availableProjects, availableModules, availableMembers, subDepartmentStatuses] =
    await Promise.all([
      projectsPromise,
      modulesPromise,
      membersPromise,
      getSubDepartmentStatuses(statusSubDepartmentId),
    ]);

  return {
    subDepartmentStatuses,
    availableProjects,
    availableModules,
    availableMembers,
    defaultSubDepartmentId: statusSubDepartmentId ?? profile.subDepartmentId ?? null,
  };
}
