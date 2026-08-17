import { prisma } from "@/lib/db";

const activeAccessGrant = {
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
};

/** Profiles eligible for a project: native dept members/managers/leads + cross-access grants. */
export function buildProjectDepartmentPeopleWhere(projectDeptId: string) {
  return {
    deletedAt: null,
    OR: [
      {
        memberships: {
          some: {
            isActive: true,
            team: { departmentId: projectDeptId },
          },
        },
      },
      {
        managedDepartments: {
          some: { departmentId: projectDeptId },
        },
      },
      {
        departmentAccesses: {
          some: {
            departmentId: projectDeptId,
            ...activeAccessGrant,
          },
        },
      },
      {
        directDeptMemberships: {
          some: { departmentId: projectDeptId },
        },
      },
    ],
  };
}

const personSelect = (projectDeptId: string) =>
  ({
    id: true,
    name: true,
    avatarUrl: true,
    role: true,
    team: {
      select: {
        name: true,
        department: { select: { id: true, name: true } },
      },
    },
    memberships: {
      where: { isActive: true },
      select: {
        team: {
          select: {
            id: true,
            name: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
      take: 5,
    },
    managedDepartments: {
      where: { departmentId: projectDeptId },
      select: { department: { select: { id: true, name: true } } },
      take: 1,
    },
    directDeptMemberships: {
      where: { departmentId: projectDeptId },
      select: { department: { select: { id: true, name: true } } },
      take: 1,
    },
  }) as const;

type PersonRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  team: {
    name: string;
    department: { id: string; name: string } | null;
  } | null;
  memberships: {
    team: {
      id: string;
      name: string;
      department: { id: string; name: string } | null;
    };
  }[];
  managedDepartments: { department: { id: string; name: string } }[];
  directDeptMemberships: { department: { id: string; name: string } }[];
};

export function mapProjectDepartmentPerson(
  p: PersonRow,
  projectDeptId: string,
): {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  departmentName: string | null;
  teamName: string | null;
} {
  const inDept = p.memberships.find((m) => m.team.department?.id === projectDeptId);
  const outsideDept = p.memberships.find(
    (m) => m.team.department?.id && m.team.department.id !== projectDeptId,
  );
  const fallbackTeam = p.team ?? outsideDept?.team ?? p.memberships[0]?.team ?? null;
  const homeDept = fallbackTeam?.department?.name ?? null;
  const homeTeam = fallbackTeam?.name ?? null;

  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl ?? null,
    role: p.role,
    departmentName:
      inDept?.team.department?.name ??
      p.managedDepartments[0]?.department?.name ??
      p.directDeptMemberships[0]?.department?.name ??
      homeDept,
    teamName: inDept?.team.name ?? homeTeam,
  };
}

export async function fetchProjectDepartmentPeople(projectDeptId: string | null) {
  if (!projectDeptId) return [];

  const rows = await prisma.profile.findMany({
    where: buildProjectDepartmentPeopleWhere(projectDeptId),
    select: personSelect(projectDeptId),
    orderBy: { name: "asc" },
  });

  return rows.map((p) => mapProjectDepartmentPerson(p, projectDeptId));
}

export async function assertUsersEligibleForProjectDepartment(
  projectDeptId: string | null,
  userIds: string[],
): Promise<{ ok: true } | { ok: false; invalidIds: string[] }> {
  if (userIds.length === 0) return { ok: true };
  if (!projectDeptId) {
    return { ok: false, invalidIds: userIds };
  }

  const eligible = await prisma.profile.findMany({
    where: {
      ...buildProjectDepartmentPeopleWhere(projectDeptId),
      id: { in: userIds },
    },
    select: { id: true },
  });
  const eligibleSet = new Set(eligible.map((p) => p.id));
  const invalidIds = userIds.filter((id) => !eligibleSet.has(id));
  if (invalidIds.length > 0) return { ok: false, invalidIds };
  return { ok: true };
}
