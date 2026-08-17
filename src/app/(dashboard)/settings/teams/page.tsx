import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import {
  SettingsTeamsPage,
  type TeamRow,
  type PendingRequest,
} from "@/components/settings/settings-teams-page";

export const metadata = { title: "Teams & roles — Ticketing System" };

export default async function SettingsTeamsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isLead = profile.role === "lead";

  // Leads see the same view as managers (their own team's department).
  // Plain staff are redirected.
  if (!isAdmin && !isManager && !isLead) redirect("/settings");

  // Profile-aware dept scope
  const profileDeptScope = await getProfileDeptScope(profile);
  const activeDeptId = profileDeptScope?.activeDeptId ?? null;
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  if (checkIsCrossAccessDept(profile, activeDeptId)) redirect("/projects");

  // Leads: scope to the department of their primary team
  const leadDeptId = isLead
    ? await prisma.team
        .findFirst({
          where: { id: profile.teamId ?? "" },
          select: { departmentId: true },
        })
        .then((t) => t?.departmentId ?? null)
    : null;

  const deptScopeList = activeDeptId
    ? [activeDeptId]
    : isManager
      ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
      : isLead && leadDeptId
        ? [leadDeptId]
        : null;

  // Fetch department managers so we can display them as team leads when
  // no explicit TeamMembership with role="lead" exists.
  const deptManagerMap = new Map<string, { name: string; avatarUrl: string | null }>();
  if (deptScopeList?.length) {
    const deptManagers = await prisma.departmentManager.findMany({
      where: { departmentId: { in: deptScopeList } },
      select: { departmentId: true, user: { select: { name: true, avatarUrl: true } } },
      orderBy: { assignedAt: "asc" },
    });
    // Keep first assigned manager per department
    for (const dm of deptManagers) {
      if (!deptManagerMap.has(dm.departmentId)) {
        deptManagerMap.set(dm.departmentId, { name: dm.user.name, avatarUrl: dm.user.avatarUrl ?? null });
      }
    }
  }

  const [teams, departments, joinRequests] = await Promise.all([
    prisma.team.findMany({
      where: isAdmin
        ? activeDeptId ? { departmentId: activeDeptId } : { tenantId }
        : deptScopeList?.length
          ? { departmentId: { in: deptScopeList } }
          : { id: { in: [] } },
      include: {
        department: { select: { id: true, name: true } },
        memberships: {
          where: { isActive: true },
          select: {
            role: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: isAdmin
        ? { tenantId }
        : deptScopeList?.length
          ? { id: { in: deptScopeList } }
          : { id: { in: [] } },
      orderBy: { name: "asc" },
      include: { teams: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    isAdmin || isManager
      ? prisma.joinRequest.findMany({
          where: {
            status: "pending",
            departmentId: isAdmin ? { not: null } : { in: deptScopeList ?? [] },
          },
          orderBy: { requestedAt: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            department: {
              select: {
                id: true,
                name: true,
                teams: { orderBy: { name: "asc" }, select: { id: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const rows: TeamRow[] = teams.map((team) => {
    const explicitLeads = team.memberships
      .filter((m) => m.role === "lead")
      .map((m) => ({ name: m.user.name, avatarUrl: m.user.avatarUrl ?? null }));

    const teamManagerMember = team.memberships.find((m) => m.role === "manager" || m.role === "admin");
    const deptManager = deptManagerMap.get(team.department.id);

    const fallbackLead =
      teamManagerMember?.user ??
      (deptManager ? { name: deptManager.name, avatarUrl: deptManager.avatarUrl } : null) ??
      team.memberships[0]?.user ??
      null;

    const leads =
      explicitLeads.length > 0
        ? explicitLeads
        : fallbackLead
          ? [{ name: fallbackLead.name, avatarUrl: fallbackLead.avatarUrl ?? null }]
          : [];

    const leadIds = new Set(
      team.memberships.filter((m) => m.role === "lead").map((m) => m.user.id),
    );
    const nonLeadMembers = team.memberships.filter((m) => !leadIds.has(m.user.id));

    return {
      id: team.id,
      name: team.name,
      prefix: team.prefix,
      departmentId: team.department.id,
      color: (team as any).color ?? avatarColorFor(team.name),
      leads,
      memberColors: nonLeadMembers.slice(0, 3).map((m) => avatarColorFor(m.user.name)),
      members: nonLeadMembers.slice(0, 3).map((m) => ({
        name: m.user.name,
        avatarUrl: m.user.avatarUrl ?? null,
      })),
      extraMembers: Math.max(0, nonLeadMembers.length - 3),
      department: team.department.name,
    };
  });

  const pendingRequests: PendingRequest[] = joinRequests
    .filter((r) => r.department)
    .map((r) => ({
      id: r.id,
      departmentId: r.department!.id,
      departmentName: r.department!.name,
      teams: r.department!.teams,
      userId: r.user.id,
      userName: r.user.name,
      userEmail: r.user.email,
      userColor: avatarColorFor(r.user.name),
      userAvatarUrl: r.user.avatarUrl ?? null,
      requestedAt: r.requestedAt.toISOString(),
    }));

  return (
    <SettingsTeamsPage
      teams={rows}
      departments={departments}
      isAdmin={isAdmin}
      isManager={isManager || isLead}
      pendingRequests={pendingRequests}
    />
  );
}
