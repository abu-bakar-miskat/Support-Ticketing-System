import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, getPersonalTaskDeptScope, resolveStatusTeamId } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { assignedProjectsInDeptWhere } from "@/lib/cross-access";
import {
  getBoardCards,
  getTeamReviewCards,
  getAssignedSubtasks,
  getTeamStatusesForTeamIds,
  getTeamStatuses,
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

  let managedTeamIds: string[] = [];
  if (isMgrOrAdmin) {
    if (deptScope?.teamIds?.length) {
      managedTeamIds = deptScope.teamIds;
    } else {
      const allowedDeptIds = [
        ...(profile.managedDepartmentIds ?? []),
        ...(profile.grantedAccessDeptIds ?? []),
      ];
      if (allowedDeptIds.length > 0) {
        const teams = await prisma.team.findMany({
          where: { departmentId: { in: allowedDeptIds } },
          select: { id: true },
        });
        managedTeamIds = teams.map((t) => t.id);
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
    isMgrOrAdmin ? getTeamReviewCards(managedTeamIds, profile.id) : Promise.resolve([]),
    getAssignedSubtasks(
      profile.id,
      personalTaskScope ? { allowedDeptIds: personalTaskScope.allowedDeptIds } : {},
    ),
  ]);

  const teamIds = [...new Set(myCards.map((c) => c.teamId))];
  const teamStatusMap = await getTeamStatusesForTeamIds(teamIds);

  return {
    tasks: myCards,
    subtasks,
    reviewTasks: reviewCards,
    isManager: isMgrOrAdmin,
    teamStatusMap: Object.fromEntries(teamStatusMap),
  };
}

export async function getTasksMetaData(
  profile: Profile,
  activeDeptId?: string | null,
): Promise<TasksMetaResponse> {
  const cookieStore = await cookies();
  const cookieTeamId = cookieStore.get("pen_active_team")?.value ?? null;
  const membershipIds = profile.teamIds ?? [];

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  const deptScope = await getProfileDeptScope(profile);

  const statusTeamId = resolveStatusTeamId({
    deptScope,
    cookieTeamId,
    membershipIds,
    primaryTeamId: profile.teamId,
  });

  const projectsPromise = (async () => {
    if (deptScope?.isCrossAccessOnly && profile.id) {
      return prisma.project.findMany({
        where: assignedProjectsInDeptWhere(profile.id, deptScope.activeDeptId),
        select: { id: true, name: true, teamId: true, kind: true },
        orderBy: { name: "asc" },
      });
    }

    if (deptScope?.activeDeptId) {
      const scopedDeptId = deptScope.activeDeptId;
      return prisma.project.findMany({
        where: {
          OR: [
            { departmentId: scopedDeptId },
            { team: { departmentId: scopedDeptId } },
          ],
        },
        select: { id: true, name: true, teamId: true, kind: true },
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
              { team: { departmentId: { in: allowedDeptIds } } },
            ],
          },
          select: { id: true, name: true, teamId: true, kind: true },
          orderBy: { name: "asc" },
        });
      }
      if (isAdmin) {
        return prisma.project.findMany({
          select: { id: true, name: true, teamId: true, kind: true },
          orderBy: { name: "asc" },
        });
      }
      return [];
    }
    if (profile.role === "lead" && profile.teamId) {
      return prisma.project.findMany({
        where: { teamId: profile.teamId },
        select: { id: true, name: true, teamId: true, kind: true },
        orderBy: { name: "asc" },
      });
    }
    const memberships = await prisma.projectMember.findMany({
      where: { userId: profile.id },
      select: { project: { select: { id: true, name: true, teamId: true, kind: true } } },
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

    if (!deptId && profile.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: profile.teamId },
        select: { departmentId: true },
      });
      return fetchProjectDepartmentPeople(team?.departmentId ?? null);
    }

    if (!deptId) return [];

    return fetchProjectDepartmentPeople(deptId);
  })();

  const [availableProjects, availableModules, availableMembers, teamStatuses] =
    await Promise.all([
      projectsPromise,
      modulesPromise,
      membersPromise,
      getTeamStatuses(statusTeamId),
    ]);

  return {
    teamStatuses,
    availableProjects,
    availableModules,
    availableMembers,
    defaultTeamId: statusTeamId ?? profile.teamId ?? null,
  };
}
