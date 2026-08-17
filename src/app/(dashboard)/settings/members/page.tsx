import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import {
  SettingsMembersPage,
  type MemberRow,
} from "@/components/settings/settings-members-page";

export const metadata = { title: "Members — Ticketing System" };

export default async function SettingsMembersRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isLead = profile.role === "lead";

  // Admin + manager + lead can access members
  if (!isAdmin && !isManager && !isLead) redirect("/settings");

  // Profile-aware scope — always derives the correct dept for managers
  const profileScope = await getProfileDeptScope(profile);
  // Admins default to the global view (all members). Only scope to a department
  // when one is explicitly active via the dept cookie.
  const activeDeptId = profileScope?.activeDeptId ?? null;
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  if (checkIsCrossAccessDept(profile, activeDeptId)) redirect("/projects");

  let profiles: any[];
  let allMemberships: any[];
  // Direct department members (added via department page, not via a team)
  let directDeptMembers: Array<{ userId: string; department: { id: string; name: string } }> = [];
  // doNotAssign map: userId → list of { teamId, teamName, doNotAssign }
  const doNotAssignMap = new Map<string, { teamId: string; teamName: string; doNotAssign: boolean }[]>();

  if (isAdmin) {
    if (activeDeptId) {
      // Dept cookie active — show only members of that department
      [allMemberships, directDeptMembers] = await Promise.all([
        (prisma.teamMembership as any)
          .findMany({
            where: { isActive: true, team: { departmentId: activeDeptId } },
            select: {
              userId: true,
              doNotAssign: true,
              team: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
            },
          })
          .catch((e: unknown) => { console.error("[members/page] admin-dept teamMembership query failed:", e); return [] as any[]; }),
        (prisma.departmentMember as any)
          .findMany({
            where: { departmentId: activeDeptId },
            select: { userId: true, department: { select: { id: true, name: true } } },
          })
          .catch((e: unknown) => { console.error("[members/page] admin-dept departmentMember query failed:", e); return [] as { userId: string; department: { id: string; name: string } }[]; }),
      ]);
      const deptUserIds = [...new Set([
        ...allMemberships.map((m: any) => m.userId),
        ...directDeptMembers.map((dm: any) => dm.userId),
      ])];
      profiles = await prisma.profile.findMany({
        where: { id: { in: deptUserIds }, deletedAt: null },
        orderBy: { name: "asc" },
      });
    } else {
      // No dept filter — show all members OF THIS TENANT
      [profiles, allMemberships, directDeptMembers] = await Promise.all([
        prisma.profile.findMany({
          where: { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } },
          orderBy: { name: "asc" },
        }),
        (prisma.teamMembership as any)
          .findMany({
            where: { isActive: true, team: { tenantId } },
            select: {
              userId: true,
              doNotAssign: true,
              team: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
            },
          })
          .catch((e: unknown) => { console.error("[members/page] admin-all teamMembership query failed:", e); return [] as any[]; }),
        (prisma.departmentMember as any)
          .findMany({
            where: { department: { tenantId } },
            select: { userId: true, department: { select: { id: true, name: true } } },
          })
          .catch((e: unknown) => { console.error("[members/page] admin-all departmentMember query failed:", e); return [] as { userId: string; department: { id: string; name: string } }[]; }),
      ]);
    }
  } else if (isManager) {
    // Managers see only members of their department(s)
    const deptIds = profileScope
      ? [profileScope.activeDeptId]
      : [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])];

    [allMemberships, directDeptMembers] = await Promise.all([
      (prisma.teamMembership as any)
        .findMany({
          where: {
            isActive: true,
            team: { departmentId: { in: deptIds } },
          },
          select: {
            userId: true,
            doNotAssign: true,
            team: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
          },
        })
        .catch((e: unknown) => { console.error("[members/page] manager teamMembership query failed:", e); return [] as any[]; }),
      (prisma.departmentMember as any)
        .findMany({
          where: { departmentId: { in: deptIds } },
          select: { userId: true, department: { select: { id: true, name: true } } },
        })
        .catch(() => [] as { userId: string; department: { id: string; name: string } }[]),
    ]);

    const allUserIds = [...new Set([
      ...allMemberships.map((m: any) => m.userId),
      ...directDeptMembers.map((dm) => dm.userId),
    ])];
    profiles = await prisma.profile.findMany({
      where: { id: { in: allUserIds }, deletedAt: null },
      orderBy: { name: "asc" },
    });
  } else {
    // Lead — scoped to their own team(s), handled in the isLead block below
    [profiles, allMemberships, directDeptMembers] = [[], [], []];
  }

  if (isLead) {
    // Lead sees all members of their own team(s)
    const leadTeamIds = profile.teamIds?.length
      ? profile.teamIds
      : profile.teamId ? [profile.teamId] : [];
    allMemberships = leadTeamIds.length
      ? await (prisma.teamMembership as any).findMany({
          where: { isActive: true, teamId: { in: leadTeamIds } },
          select: { userId: true, doNotAssign: true, team: { select: { id: true, name: true, department: { select: { id: true, name: true } } } } },
        }).catch((e: unknown) => { console.error("[members/page] lead teamMembership query failed:", e); return [] as any[]; })
      : [];
    const memberUserIds = [...new Set(allMemberships.map((m: any) => m.userId))];
    profiles = await prisma.profile.findMany({ where: { id: { in: memberUserIds }, deletedAt: null }, orderBy: { name: "asc" } });
  }

  // Fetch available teams for the team assignment dropdown (admin/manager only).
  // When a department is active, only that department's teams — required for invites + Add member.
  const availableTeams = (isAdmin || isManager)
    ? await prisma.team.findMany({
        where: activeDeptId
          ? { departmentId: activeDeptId }
          : isAdmin
            ? {}
            : (() => {
                const deptIds = [
                  ...(profile.managedDepartmentIds ?? []),
                  ...(profile.grantedAccessDeptIds ?? []),
                ];
                return deptIds.length ? { departmentId: { in: deptIds } } : { id: { in: [] as string[] } };
              })(),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const teamsByUser = new Map<string, string[]>();
  const teamIdByUser = new Map<string, string>();
  const deptByUser = new Map<string, string>();
  const deptIdByUser = new Map<string, string>();
  const nativeUserIds = new Set<string>();
  for (const m of allMemberships as any[]) {
    const list = teamsByUser.get(m.userId) ?? [];
    list.push(m.team.name);
    teamsByUser.set(m.userId, list);
    if (!teamIdByUser.has(m.userId) && m.team?.id) {
      teamIdByUser.set(m.userId, m.team.id);
    }
    if (m.team?.department?.name && !deptByUser.has(m.userId)) {
      deptByUser.set(m.userId, m.team.department.name);
    }
    if (m.team?.department?.id && !deptIdByUser.has(m.userId)) {
      deptIdByUser.set(m.userId, m.team.department.id);
    }
    nativeUserIds.add(m.userId);
    // Build doNotAssign map per user → list of team memberships
    if (m.team?.id) {
      const existing = doNotAssignMap.get(m.userId) ?? [];
      existing.push({ teamId: m.team.id, teamName: m.team.name, doNotAssign: m.doNotAssign ?? false });
      doNotAssignMap.set(m.userId, existing);
    }
  }
  // Fill in dept info for direct members who have no team membership
  for (const dm of directDeptMembers) {
    nativeUserIds.add(dm.userId);
    if (!deptByUser.has(dm.userId)) {
      deptByUser.set(dm.userId, dm.department.name);
    }
    if (!deptIdByUser.has(dm.userId)) {
      deptIdByUser.set(dm.userId, dm.department.id);
    }
  }

  // Fetch cross-access users for the active department and append them with an indicator
  let crossAccessRows: MemberRow[] = [];
  if (activeDeptId) {
    const grants = await prisma.departmentAccess.findMany({
      where: {
        departmentId: activeDeptId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        NOT: { userId: { in: [...nativeUserIds] } },
      },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true, role: true,
            team: { select: { name: true, department: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    crossAccessRows = grants.map((g) => ({
      id: g.user.id,
      name: g.user.name,
      email: g.user.email,
      color: avatarColorFor(g.user.name),
      avatarUrl: g.user.avatarUrl ?? null,
      role: g.user.role as MemberRow["role"],
      // Their real, native team — shown read-only; a manager here can't reassign a
      // guest's team since it belongs to a different department than this page manages.
      teams: g.user.team?.name ? [g.user.team.name] : [],
      teamId: null,
      department: g.user.team?.department?.name ?? null,
      // The department they were granted cross-access to (this page's context) — used to
      // target the "revoke access" action, distinct from `department` (their home dept, shown above).
      departmentId: activeDeptId,
      isCrossAccess: true,
    }));
  }

  const activeDept = activeDeptId
    ? await prisma.department.findUnique({ where: { id: activeDeptId }, select: { name: true } })
    : null;

  const members: MemberRow[] = [
    ...profiles.map((p: { id: string; name: string; email: string; avatarUrl?: string | null; role: string; teamId?: string | null; location?: string | null; timezone?: string | null; isActive?: boolean | null }) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      color: avatarColorFor(p.name),
      avatarUrl: p.avatarUrl ?? null,
      role: p.role as MemberRow["role"],
      location: p.location ?? null,
      timezone: p.timezone ?? null,
      isActive: p.isActive ?? true,
      teams: teamsByUser.get(p.id) ?? [],
      teamId: p.teamId ?? teamIdByUser.get(p.id) ?? null,
      department: deptByUser.get(p.id) ?? null,
      departmentId: deptIdByUser.get(p.id) ?? null,
      isCrossAccess: false,
      teamMemberships: doNotAssignMap.get(p.id) ?? [],
    })),
    ...crossAccessRows,
  ];

  return (
    <SettingsMembersPage
      members={members}
      isAdmin={isAdmin}
      isManager={isManager}
      availableTeams={availableTeams}
      currentUserId={profile.id}
      departmentId={activeDeptId}
      departmentName={activeDept?.name ?? null}
    />
  );
}
