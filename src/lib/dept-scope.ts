/**
 * Department scope helpers.
 *
 * getActiveDeptScope()         — reads cookie, no auth context (use for admin)
 * getProfileDeptScope(profile) — validates cookie against the profile's allowed
 *                                depts and auto-derives the correct dept for
 *                                managers/staff. USE THIS in all pages.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isNativeDeptMemberOrManager } from "@/lib/support-project";
import { resolveActiveTenantId, departmentInTenant } from "@/lib/tenant-scope";

export type DeptScope = {
  activeDeptId: string;
  teamIds: string[];
  /** Pass directly to getBoardCards / prisma where clauses */
  allowedDeptIds: string[];
  /** True when the active department is a hub (cross-dept oversight) department */
  isHub?: boolean;
  /**
   * True when the caller only reaches this department via a DepartmentAccess/DepartmentMember
   * grant (not native team membership or management) — visibility must be restricted to their
   * own ProjectMember assignments within this department.
   */
  isCrossAccessOnly?: boolean;
} | null;

type ActiveDeptScope = NonNullable<DeptScope>;

export type ProfileLike = {
  id?: string;
  role: string;
  teamId?: string | null;
  teamIds?: string[];
  managedDepartmentIds?: string[];
  grantedAccessDeptIds?: string[];
  /** Subset of grantedAccessDeptIds where the DepartmentAccess grant has fullAccess: true */
  fullAccessGrantedDeptIds?: string[];
  directMemberDeptIds?: string[];
  isHubMember?: boolean;
  /** Platform super-admin — transcends tenant scope. */
  isSuperAdmin?: boolean;
  /** Tenant ids the user is an active member of. */
  tenantIds?: string[];
  /** Pre-resolved active tenant (from getProfile); resolved lazily when absent. */
  activeTenantId?: string | null;
};

/**
 * The profile's active tenant — the pre-resolved value from getProfile when
 * present, otherwise resolved from the cookie/membership. Used to bound admin
 * "global" (no active department) list views to a single tenant.
 */
export async function resolveProfileActiveTenantId(
  profile: ProfileLike,
): Promise<string | null> {
  if (profile.activeTenantId !== undefined) return profile.activeTenantId;
  return resolveActiveTenantId(profile);
}

async function buildScope(deptId: string): Promise<DeptScope> {
  const teams = await prisma.team.findMany({
    where: { departmentId: deptId },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  return {
    activeDeptId: deptId,
    teamIds: teams.map((t) => t.id),
    allowedDeptIds: [deptId],
  };
}

/**
 * Build scope for a hub (cross-dept oversight) department.
 * Members see only projects they're personally assigned to across all depts.
 * Managers see projects assigned to any hub dept member.
 * teamIds expands to include teams owning those cross-dept projects so the
 * board and ticket queries pick up the right data automatically.
 */
async function buildHubScope(
  deptId: string,
  profile: ProfileLike,
  isManagerOfDept: boolean,
): Promise<DeptScope> {
  const hubTeams = await prisma.team.findMany({
    where: { departmentId: deptId },
    select: { id: true },
  });
  const hubTeamIds = hubTeams.map((t) => t.id);

  let projectMemberWhere: Record<string, unknown>;

  if (isManagerOfDept) {
    // Managers see all projects assigned to any member of the hub dept
    const memberRows = await prisma.teamMembership.findMany({
      where: { teamId: { in: hubTeamIds }, isActive: true },
      select: { userId: true },
    });
    const memberIds = [...new Set(memberRows.map((m) => m.userId))];
    projectMemberWhere = memberIds.length > 0 ? { userId: { in: memberIds } } : { userId: "__none__" };
  } else {
    // Members see only their own project assignments
    projectMemberWhere = profile.id ? { userId: profile.id } : { userId: "__none__" };
  }

  const assignedProjects = await prisma.projectMember.findMany({
    where: projectMemberWhere,
    select: { project: { select: { id: true, teamId: true, departmentId: true } } },
  });

  const crossTeamIds = [
    ...new Set(
      assignedProjects.map((pm) => pm.project.teamId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const crossDeptIds = [
    ...new Set(
      assignedProjects.map((pm) => pm.project.departmentId).filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    activeDeptId: deptId,
    teamIds: [...new Set([...hubTeamIds, ...crossTeamIds])],
    allowedDeptIds: [...new Set([deptId, ...crossDeptIds])],
    isHub: true,
  };
}

/**
 * Build scope for a plain (non-hub) department the caller only reaches via a
 * DepartmentAccess/DepartmentMember grant. Restricted to the projects they're
 * explicitly assigned to within this specific department — unlike hub scope,
 * this does not aggregate assignments across other departments.
 */
async function buildDeptCrossAccessScope(
  deptId: string,
  profile: ProfileLike,
): Promise<DeptScope> {
  const assignedProjects = profile.id
    ? await prisma.projectMember.findMany({
        where: {
          userId: profile.id,
          project: {
            OR: [{ departmentId: deptId }, { team: { departmentId: deptId } }],
          },
        },
        select: {
          projectId: true,
          project: { select: { teamId: true, departmentId: true } },
        },
      })
    : [];

  const projectIds = assignedProjects.map((pm) => pm.projectId);
  const teamIdSet = new Set<string>();

  for (const pm of assignedProjects) {
    if (pm.project.teamId) teamIdSet.add(pm.project.teamId);
  }

  // Legacy projects may have no teamId — include teams that already host their tickets.
  if (projectIds.length > 0) {
    const ticketTeams = await prisma.ticket.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null },
      select: { teamId: true },
      distinct: ["teamId"],
    });
    for (const row of ticketTeams) teamIdSet.add(row.teamId);
  }

  // Still no teams — fall back to any team in the project's department.
  if (teamIdSet.size === 0 && assignedProjects.length > 0) {
    const deptTeams = await prisma.team.findMany({
      where: { departmentId: deptId },
      select: { id: true },
    });
    for (const t of deptTeams) teamIdSet.add(t.id);
  }

  return {
    activeDeptId: deptId,
    teamIds: [...teamIdSet],
    allowedDeptIds: [deptId],
    isCrossAccessOnly: true,
  };
}

/**
 * Build scope for a dept, automatically using hub logic when the dept is
 * marked as a hub department.
 */
async function buildScopeForDept(
  deptId: string,
  profile: ProfileLike,
  isCrossAccessOnly = false,
): Promise<DeptScope> {
  const dept = await prisma.department.findUnique({
    where: { id: deptId },
    select: { isHub: true },
  });
  if (dept?.isHub) {
    const managed: string[] = profile.managedDepartmentIds ?? [];
    return buildHubScope(deptId, profile, managed.includes(deptId));
  }
  if (isCrossAccessOnly) {
    return buildDeptCrossAccessScope(deptId, profile);
  }
  return buildScope(deptId);
}

/**
 * Pick which team's workflow statuses to show for the current department context.
 *
 * 1. If the user belongs to a team in the active department → use that team
 *    (cookie team preferred when it is in the dept).
 * 2. If the user is only in teams from other departments → use the active
 *    department's default team (first team in the dept, name-sorted).
 * 3. No department context → fall back to the user's active team.
 */
export function resolveStatusTeamId(opts: {
  deptScope: DeptScope | null;
  cookieTeamId: string | null;
  membershipIds: string[];
  primaryTeamId?: string | null;
}): string | null {
  const { deptScope, cookieTeamId, membershipIds, primaryTeamId } = opts;
  const deptTeamIds = deptScope?.teamIds ?? [];

  if (deptTeamIds.length === 0) {
    return (
      (cookieTeamId && membershipIds.includes(cookieTeamId)
        ? cookieTeamId
        : null) ??
      membershipIds[0] ??
      primaryTeamId ??
      null
    );
  }

  const deptTeamIdSet = new Set(deptTeamIds);

  const userTeamInDept =
    (cookieTeamId && deptTeamIdSet.has(cookieTeamId) ? cookieTeamId : null) ??
    membershipIds.find((id) => deptTeamIdSet.has(id)) ??
    (primaryTeamId && deptTeamIdSet.has(primaryTeamId)
      ? primaryTeamId
      : null) ??
    null;

  if (userTeamInDept) return userTeamInDept;

  // Viewer is from another department — show the active department's default workflow
  return deptTeamIds[0] ?? null;
}

/** Prisma filter: all projects belonging to a department (direct or via team). */
export function deptProjectsForDeptWhere(deptId: string) {
  return {
    OR: [{ departmentId: deptId }, { team: { departmentId: deptId } }],
  };
}

/**
 * Prisma where: tickets that BELONG to a department. A ticket belongs to the
 * department that owns its *project* (either the project's own department, or —
 * when the project has none — the project's team's department). Tickets with no
 * project fall back to their own team's department.
 *
 * This differs from `{ teamId: { in: deptScope.teamIds } }`: someone with
 * cross-dept access can create a ticket on their *own* team but inside another
 * department's project — that ticket belongs to the project's department, not
 * the team's. Use this for contribution/attribution, not raw board scoping.
 */
export function ticketInDeptWhere(deptId: string) {
  return {
    OR: [
      { project: { departmentId: deptId } },
      { project: { departmentId: null, team: { departmentId: deptId } } },
      { projectId: null, team: { departmentId: deptId } },
    ],
  };
}

/** Prisma select fragment carrying everything {@link effectiveTicketDept} needs. */
export const TICKET_DEPT_SELECT = {
  projectId: true,
  project: {
    select: {
      departmentId: true,
      department: { select: { id: true, name: true } },
      team: { select: { department: { select: { id: true, name: true } } } },
    },
  },
  team: { select: { department: { select: { id: true, name: true } } } },
} as const;

type DeptRef = { id: string; name: string };

/** The department a ticket belongs to — project's department first, team as fallback. */
export function effectiveTicketDept(t: {
  project?: {
    department?: DeptRef | null;
    team?: { department?: DeptRef | null } | null;
  } | null;
  team?: { department?: DeptRef | null } | null;
}): DeptRef | null {
  const p = t.project;
  if (p) {
    if (p.department) return p.department;
    if (p.team?.department) return p.team.department;
  }
  return t.team?.department ?? null;
}

/** Prisma where: projects belonging to the active department. */
export function buildProjectDeptWhere(deptScope: ActiveDeptScope) {
  return deptProjectsForDeptWhere(deptScope.activeDeptId);
}

/** Prisma where: sprints tied to the active department (via project or tickets). */
export function buildSprintDeptWhere(deptScope: ActiveDeptScope) {
  return {
    OR: [
      { project: { departmentId: deptScope.activeDeptId } },
      { project: { teamId: { in: deptScope.teamIds } } },
      {
        tickets: {
          some: { deletedAt: null, teamId: { in: deptScope.teamIds } },
        },
      },
    ],
  };
}

/**
 * Sprint has no tenantId column, so bound an admin's global view via its
 * project/ticket relations (both carry tenantId).
 */
async function sprintTenantWhere(profile: ProfileLike) {
  const tenantId = await resolveProfileActiveTenantId(profile);
  if (!tenantId) return {};
  return {
    OR: [
      { project: { tenantId } },
      { tickets: { some: { deletedAt: null, tenantId } } },
    ],
  };
}

/** List filter for sprints based on profile + active department cookie. */
export async function resolveSprintListWhere(profile: ProfileLike) {
  const deptScope = await getProfileDeptScope(profile);
  if (deptScope) return buildSprintDeptWhere(deptScope);
  // No active department. Admins see the whole *tenant* (not all tenants).
  if (profile.role === "admin") return sprintTenantWhere(profile);
  const teamIds = profile.teamIds ?? (profile.teamId ? [profile.teamId] : []);
  if (teamIds.length === 0) return { id: { in: [] as string[] } };
  return {
    tickets: { some: { deletedAt: null, teamId: { in: teamIds } } },
  };
}

/** Returns true when a sprint is visible in the caller's current department scope. */
export async function sprintInScope(profile: ProfileLike, sprintId: string) {
  const where = await resolveSprintListWhere(profile);
  const count = await prisma.sprint.count({
    where: { id: sprintId, AND: [where] },
  });
  return count > 0;
}

/** Returns true when a module's project is visible in the caller's current department scope. */
export async function moduleInScope(profile: ProfileLike, moduleId: string) {
  const moduleRow = await prisma.projectModule.findUnique({
    where: { id: moduleId },
    select: { projectId: true },
  });
  if (!moduleRow) return false;
  return projectInScope(profile, moduleRow.projectId);
}

/** Returns true when a project belongs to the active department scope OR the user is an explicit member. */
export async function projectInScope(profile: ProfileLike, projectId: string) {
  const projectRow = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      kind: true,
      departmentId: true,
      team: { select: { departmentId: true } },
    },
  });
  if (projectRow) {
    const deptId = projectRow.departmentId ?? projectRow.team?.departmentId ?? null;
    if (deptId && isNativeDeptMemberOrManager(profile, deptId)) {
      const deptScope = await getProfileDeptScope(profile);
      // Cross-access guests only see projects they're explicitly assigned to.
      if (!deptScope?.isCrossAccessOnly) return true;
    }
  }

  const deptScope = await getProfileDeptScope(profile);
  if (!deptScope) return profile.role === "admin";

  // Cross-access-only scope: buildProjectDeptWhere's direct departmentId match would wrongly
  // admit department-attached projects the user isn't assigned to — check ProjectMember only.
  if (deptScope.isCrossAccessOnly) {
    if (!profile.id) return false;
    const count = await prisma.project.count({
      where: {
        id: projectId,
        members: { some: { userId: profile.id } },
        OR: [
          { departmentId: deptScope.activeDeptId },
          { team: { departmentId: deptScope.activeDeptId } },
        ],
      },
    });
    return count > 0;
  }

  // Fast path: project is in the active dept scope
  const inScope = await prisma.project.count({
    where: { id: projectId, AND: [buildProjectDeptWhere(deptScope)] },
  });
  if (inScope > 0) return true;

  // Cross-dept: any explicit project member can access their project regardless of the
  // active department workspace — covers hub members, and cross-access guests whose
  // active-dept cookie differs from the project's department (mirrors assertTicketAccess).
  if (!profile.id) return false;
  const memberCount = await prisma.projectMember.count({
    where: { projectId, userId: profile.id },
  });
  return memberCount > 0;
}

/** Validate ticket IDs belong to the active department (and optional project). */
export async function ticketsInScope(
  profile: ProfileLike,
  ticketIds: string[],
  projectId?: string | null,
) {
  if (ticketIds.length === 0) return true;
  const deptScope = await getProfileDeptScope(profile);

  if (deptScope?.isCrossAccessOnly && profile.id) {
    const memberCount = await prisma.ticket.count({
      where: {
        id: { in: ticketIds },
        deletedAt: null,
        isDraft: false,
        ...(projectId ? { projectId } : {}),
        project: {
          members: { some: { userId: profile.id } },
          OR: [
            { departmentId: deptScope.activeDeptId },
            { team: { departmentId: deptScope.activeDeptId } },
          ],
        },
      },
    });
    return memberCount === ticketIds.length;
  }

  const teamIds =
    deptScope?.teamIds ??
    profile.teamIds ??
    (profile.teamId ? [profile.teamId] : []);

  if (profile.role !== "admin" && teamIds.length === 0) return false;

  const count = await prisma.ticket.count({
    where: {
      id: { in: ticketIds },
      deletedAt: null,
      isDraft: false,
      ...(projectId ? { projectId } : {}),
      ...(deptScope || profile.role !== "admin"
        ? { teamId: { in: teamIds } }
        : {}),
    },
  });
  if (count === ticketIds.length) return true;
  if (profile.role === "admin" || !profile.id) return false;

  // Fallback: tickets whose project the caller is an explicit member of, regardless of
  // the active department workspace cookie (mirrors assertTicketAccess's ProjectMember check) —
  // covers a cross-access guest acting on a ticket while their active dept is elsewhere.
  const memberCount = await prisma.ticket.count({
    where: {
      id: { in: ticketIds },
      deletedAt: null,
      isDraft: false,
      ...(projectId ? { projectId } : {}),
      project: { members: { some: { userId: profile.id } } },
    },
  });
  return memberCount === ticketIds.length;
}

/** Returns true when a team belongs to the active department scope. */
export async function teamInScope(profile: ProfileLike, teamId: string) {
  const deptScope = await getProfileDeptScope(profile);
  if (!deptScope) return profile.role === "admin";
  return deptScope.teamIds.includes(teamId);
}

/**
 * Can read team workflow data (statuses, members) — either in the active
 * department workspace, as a team member, or when assigned to tickets on that team.
 */
export async function canReadTeamData(
  profile: ProfileLike,
  teamId: string,
): Promise<boolean> {
  if (await teamInScope(profile, teamId)) return true;

  const membershipIds =
    profile.teamIds ?? (profile.teamId ? [profile.teamId] : []);
  if (membershipIds.includes(teamId)) return true;

  // Managers are virtual members of every team in their managed departments
  if (profile.role === "manager") {
    const managed: string[] = profile.managedDepartmentIds ?? [];
    if (managed.length > 0) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { departmentId: true },
      });
      if (team?.departmentId && managed.includes(team.departmentId)) return true;
    }
  }

  if (!profile.id) return false;

  const assignedCount = await prisma.ticket.count({
    where: {
      teamId,
      deletedAt: null,
      OR: [
        { assigneeId: profile.id },
        { assignees: { some: { userId: profile.id } } },
      ],
    },
  });
  return assignedCount > 0;
}

/** Returns true when a department matches the active workspace scope. */
export async function departmentIdInScope(
  profile: ProfileLike,
  departmentId: string,
) {
  const deptScope = await getProfileDeptScope(profile);
  if (deptScope) return deptScope.activeDeptId === departmentId;
  if (profile.role === "admin") return true;
  const allowed = [
    ...(profile.managedDepartmentIds ?? []),
    ...(profile.grantedAccessDeptIds ?? []),
    ...(profile.directMemberDeptIds ?? []),
  ];
  return allowed.includes(departmentId);
}

/** Team membership filter for people pickers in the active department. */
export function buildPeopleMembershipWhere(
  profile: ProfileLike,
  deptScope: ActiveDeptScope | null,
) {
  if (profile.role === "admin") {
    if (deptScope) return { isActive: true, teamId: { in: deptScope.teamIds } };
    // Global (no active dept) still bounded to the active tenant via the team.
    return profile.activeTenantId
      ? { isActive: true, team: { tenantId: profile.activeTenantId } }
      : { isActive: true };
  }
  if (profile.role === "manager" || profile.role === "lead") {
    const teamIds =
      deptScope?.teamIds ??
      profile.teamIds ??
      (profile.teamId ? [profile.teamId] : []);
    return { isActive: true, teamId: { in: teamIds } };
  }
  return null;
}

/**
 * Profile-aware dept scope.
 * - Admin: uses the cookie (may be null → global view)
 * - Manager: validates cookie against their managed/granted depts;
 *            falls back to their first managed dept if cookie is
 *            missing or points to a dept they no longer manage.
 * - Staff/Lead: derives from their active team's department.
 */
/**
 * Resolve the caller's active tenant, then their department scope within it.
 * The tenant is the outermost boundary: a resolved department that does not
 * belong to the active tenant is rejected (returns null), so dept scope can
 * never leak across tenants. When there is no tenant context at all (e.g. an
 * unseeded environment), the department scope is returned unguarded.
 */
export const getProfileDeptScope = cache(async function getProfileDeptScope(
  profile: ProfileLike,
): Promise<DeptScope> {
  const scope = await resolveDeptScopeInner(profile);
  if (!scope) return scope;

  const activeTenantId =
    profile.activeTenantId !== undefined
      ? profile.activeTenantId
      : await resolveActiveTenantId(profile);
  if (!activeTenantId) return scope;

  const ok = await departmentInTenant(scope.activeDeptId, activeTenantId);
  return ok ? scope : null;
});

async function resolveDeptScopeInner(
  profile: ProfileLike,
): Promise<DeptScope> {
  const cookieStore = await cookies();
  const cookieDeptId = cookieStore.get("pen_active_dept")?.value || null;

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  if (isAdmin) {
    // Admin can be in any dept or no dept (global view)
    if (!cookieDeptId) return null;
    return buildScopeForDept(cookieDeptId, profile);
  }

  if (isManager) {
    const managed = profile.managedDepartmentIds ?? [];
    const granted = profile.grantedAccessDeptIds ?? [];

    // Also allow depts the manager belongs to as a team member
    const memberDeptIds: string[] = ((profile as any).memberships ?? [])
      .map((m: any) => m.team?.department?.id)
      .filter((id: unknown): id is string => typeof id === "string");

    const fullAccessGranted = profile.fullAccessGrantedDeptIds ?? [];
    const allowed = [...new Set([...managed, ...granted, ...memberDeptIds])];
    // Depts the manager natively manages, belongs to, or has full-access grants for —
    // everything else (granted-only, limited to specific projects) is a cross-access guest visit
    const nativeIds = new Set([...managed, ...memberDeptIds, ...fullAccessGranted]);

    if (allowed.length === 0) {
      // Manager with no assigned departments — fall back to their team's dept
      return getTeamDeptScope(profile);
    }

    // Validate cookie: only trust it if it points to an allowed dept
    if (cookieDeptId && allowed.includes(cookieDeptId)) {
      return buildScopeForDept(cookieDeptId, profile, !nativeIds.has(cookieDeptId));
    }

    // Stale/missing cookie → auto-use first managed dept (preferred), then membership dept
    const fallbackDeptId = managed[0] ?? allowed[0];
    return buildScopeForDept(fallbackDeptId, profile, !nativeIds.has(fallbackDeptId));
  }

  // Lead / staff — native depts (teams, direct membership) vs cross-access grants
  const granted = profile.grantedAccessDeptIds ?? [];
  const fullAccessGranted = profile.fullAccessGrantedDeptIds ?? [];
  const directMember = profile.directMemberDeptIds ?? [];
  const memberDeptIds: string[] = ((profile as any).memberships ?? [])
    .map((m: any) => m.team?.department?.id)
    .filter((id: unknown): id is string => typeof id === "string");

  const nativeIds = new Set([...memberDeptIds, ...directMember, ...fullAccessGranted]);
  const hasMultiDeptContext =
    granted.length > 0 || directMember.length > 0 || memberDeptIds.length > 1;

  if (hasMultiDeptContext) {
    const primaryScope = await getTeamDeptScope(profile);
    const primaryDeptId = primaryScope?.activeDeptId ?? null;
    if (primaryDeptId) nativeIds.add(primaryDeptId);

    const allowed = [
      ...new Set([
        ...memberDeptIds,
        ...directMember,
        ...(primaryDeptId ? [primaryDeptId] : []),
        ...granted,
      ]),
    ];

    if (cookieDeptId && allowed.includes(cookieDeptId)) {
      return buildScopeForDept(cookieDeptId, profile, !nativeIds.has(cookieDeptId));
    }
    if (primaryScope) return primaryScope;
    const fallbackDeptId = directMember[0] ?? memberDeptIds[0] ?? granted[0];
    if (fallbackDeptId) {
      return buildScopeForDept(fallbackDeptId, profile, !nativeIds.has(fallbackDeptId));
    }
  }

  // Single native department — scope to their active team's department
  return getTeamDeptScope(profile);
}

async function getHomeDepartmentIds(profile: ProfileLike): Promise<string[]> {
  const teamIds: string[] =
    profile.teamIds ?? (profile.teamId ? [profile.teamId] : []);
  if (teamIds.length === 0) return [];

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { departmentId: true },
  });
  return [...new Set(teams.map((t) => t.departmentId))];
}

/**
 * Scope for the current user's own assigned tasks.
 * - Home department: tasks from home + all cross-access departments
 * - Guest cross-access department: only that department's tasks
 */
export async function getPersonalTaskDeptScope(
  profile: ProfileLike,
): Promise<DeptScope> {
  const deptScope = await getProfileDeptScope(profile);
  const granted = profile.grantedAccessDeptIds ?? [];
  const directMember = profile.directMemberDeptIds ?? [];
  const hasCrossAccess =
    (granted.length > 0 || directMember.length > 0) &&
    (profile.role === "staff" || profile.role === "lead");

  if (!hasCrossAccess) {
    return deptScope;
  }

  const homeDeptIds = await getHomeDepartmentIds(profile);
  const activeDeptId = deptScope?.activeDeptId ?? null;

  // Viewing a guest department — personal tasks limited to that dept only
  if (activeDeptId && !homeDeptIds.includes(activeDeptId)) {
    return deptScope;
  }

  // Home department — show all assignments across home + granted + direct-member depts
  const allDeptIds = [...new Set([...homeDeptIds, ...granted, ...directMember])];
  if (allDeptIds.length === 0) {
    return deptScope;
  }

  const allTeams = await prisma.team.findMany({
    where: { departmentId: { in: allDeptIds } },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  return {
    activeDeptId: activeDeptId ?? homeDeptIds[0] ?? allDeptIds[0],
    teamIds: allTeams.map((t) => t.id),
    allowedDeptIds: allDeptIds,
  };
}

async function getTeamDeptScope(profile: ProfileLike): Promise<DeptScope> {
  const teamIds: string[] =
    profile.teamIds ?? (profile.teamId ? [profile.teamId] : []);
  if (teamIds.length === 0) return null;

  // Find the department of the first team
  const team = await prisma.team.findFirst({
    where: { id: { in: teamIds } },
    select: { departmentId: true },
  });
  if (!team?.departmentId) return null;
  return buildScope(team.departmentId);
}

/**
 * Cookie-only version (no profile validation).
 * Only use this in admin-only contexts.
 */
export async function getActiveDeptScope(): Promise<DeptScope> {
  const cookieStore = await cookies();
  const activeDeptId = cookieStore.get("pen_active_dept")?.value || null;
  if (!activeDeptId) return null;
  return buildScope(activeDeptId);
}

/**
 * Whether the caller may add/edit a department's calendar (department holidays,
 * marking members off). Admins always; managers only for departments they manage.
 */
export function canManageDeptCalendar(
  profile: ProfileLike,
  departmentId: string,
): boolean {
  if (profile.role === "admin") return true;
  return (profile.managedDepartmentIds ?? []).includes(departmentId);
}

/**
 * Whether an admin/manager may edit a target member (role, schedule, holidays, etc.).
 * Admins: always. Managers: target must be on a team in their active dept scope,
 * or a direct DepartmentMember of that department.
 */
export async function managerCanManageUser(
  caller: ProfileLike,
  targetUserId: string,
): Promise<boolean> {
  if (caller.role === "admin") return true;
  if (caller.role !== "manager") return false;

  const deptScope = await getProfileDeptScope(caller);
  if (!deptScope) return false;

  const teamIds = deptScope.teamIds;
  const [teamMember, deptMember] = await Promise.all([
    teamIds.length > 0
      ? prisma.teamMembership.findFirst({
          where: { userId: targetUserId, teamId: { in: teamIds }, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.departmentMember.findFirst({
      where: { userId: targetUserId, departmentId: deptScope.activeDeptId },
      select: { id: true },
    }),
  ]);

  return Boolean(teamMember || deptMember);
}
