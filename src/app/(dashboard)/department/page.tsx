import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import {
  DepartmentDetailPage,
  type DepartmentDetailData,
} from "@/components/department/department-detail-page";

export const metadata = { title: "Department — Ticketing System" };

export default async function DepartmentRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  if (!isAdmin && !isManager) redirect("/settings");

  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  if (!activeDeptId) redirect("/departments");

  const [dept, managers, memberships, directMembers, accessGrants, availableTeams, allUsers, pendingInvites] =
    await Promise.all([
      prisma.department.findUnique({
        where: { id: activeDeptId },
        select: {
          id: true,
          name: true,
          isHub: true,
          type: true,
          _count: { select: { teams: true, projects: true } },
        },
      }),
      prisma.departmentManager.findMany({
        where: { departmentId: activeDeptId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true, location: true, timezone: true } } },
        orderBy: { assignedAt: "asc" },
      }),
      prisma.teamMembership.findMany({
        where: { isActive: true, team: { departmentId: activeDeptId } },
        select: {
          userId: true,
          doNotAssign: true,
          team: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true, teamId: true, location: true, timezone: true } },
        },
      }),
      prisma.departmentMember.findMany({
        where: { departmentId: activeDeptId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true, location: true, timezone: true } } },
        orderBy: { addedAt: "asc" },
      }),
      prisma.departmentAccess.findMany({
        where: { departmentId: activeDeptId },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
          grantor: { select: { id: true, name: true } },
        },
        orderBy: { grantedAt: "desc" },
      }),
      prisma.team.findMany({
        where: { departmentId: activeDeptId },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.profile.findMany({
        where: {
          deletedAt: null,
          tenantMemberships: { some: { tenantId: profile.activeTenantId ?? "__no_tenant__", isActive: true } },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      }),
      prisma.departmentInvite.findMany({
        where: {
          departmentId: activeDeptId,
          revokedAt: null,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          team: { select: { id: true, name: true } },
          inviter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  if (!dept) redirect("/departments");

  const managerUserIds = new Set(managers.map((m) => m.userId));

  // Team names (within this department) per user, and their team-membership id for the
  // team-change dropdown's "current" value.
  const teamNamesByUser = new Map<string, string[]>();
  const teamIdByUser = new Map<string, string>();
  const teamMembershipsByUser = new Map<string, { teamId: string; teamName: string; doNotAssign: boolean }[]>();
  for (const m of memberships) {
    const list = teamNamesByUser.get(m.userId) ?? [];
    list.push(m.team.name);
    teamNamesByUser.set(m.userId, list);
    if (!teamIdByUser.has(m.userId)) teamIdByUser.set(m.userId, m.team.id);
    const dna = teamMembershipsByUser.get(m.userId) ?? [];
    dna.push({ teamId: m.team.id, teamName: m.team.name, doNotAssign: m.doNotAssign ?? false });
    teamMembershipsByUser.set(m.userId, dna);
  }

  const nativeUserIds = new Set([
    ...memberships.map((m) => m.userId),
    ...directMembers.map((d) => d.userId),
  ]);

  // Members table = everyone native to this department, minus managers (shown separately).
  const memberProfilesById = new Map<string, {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    teamId: string | null;
    location: string | null;
    timezone: string | null;
  }>();
  for (const m of memberships) {
    if (managerUserIds.has(m.userId)) continue;
    memberProfilesById.set(m.userId, {
      ...m.user,
      avatarUrl: m.user.avatarUrl ?? null,
      location: m.user.location ?? null,
      timezone: m.user.timezone ?? null,
    });
  }
  for (const d of directMembers) {
    if (managerUserIds.has(d.userId) || memberProfilesById.has(d.userId)) continue;
    memberProfilesById.set(d.userId, {
      ...d.user,
      avatarUrl: d.user.avatarUrl ?? null,
      teamId: null,
      location: d.user.location ?? null,
      timezone: d.user.timezone ?? null,
    });
  }

  const data: DepartmentDetailData = {
    id: dept.id,
    name: dept.name,
    isHub: dept.isHub,
    teamCount: dept._count.teams,
    projectCount: dept._count.projects,
    memberCount: memberProfilesById.size + managerUserIds.size,
    isAdmin,
    availableTeams,
    allUsers: allUsers.map((u) => ({ ...u, avatarUrl: u.avatarUrl ?? null })),
    managers: managers.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
      color: avatarColorFor(m.user.name),
      location: m.user.location ?? null,
      timezone: m.user.timezone ?? null,
      teamMemberships: teamMembershipsByUser.get(m.userId) ?? [],
    })),
    members: [...memberProfilesById.values()].map((p) => ({
      userId: p.id,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      color: avatarColorFor(p.name),
      role: p.role,
      teamNames: teamNamesByUser.get(p.id) ?? [],
      teamId: p.teamId ?? teamIdByUser.get(p.id) ?? null,
      source: teamNamesByUser.has(p.id) ? "native" as const : "direct" as const,
      location: p.location,
      timezone: p.timezone,
      teamMemberships: teamMembershipsByUser.get(p.id) ?? [],
    })),
    accessGrants: accessGrants
      .filter((g) => !nativeUserIds.has(g.userId) && !managerUserIds.has(g.userId))
      .map((g) => ({
        id: g.id,
        userId: g.userId,
        expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
        reason: g.reason,
        grantedAt: g.grantedAt.toISOString(),
        fullAccess: g.fullAccess,
        user: { id: g.user.id, name: g.user.name, email: g.user.email, role: g.user.role, avatarUrl: g.user.avatarUrl ?? null },
        grantor: { id: g.grantor.id, name: g.grantor.name },
      })),
    pendingInvites: pendingInvites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      message: inv.message,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: null,
      revokedAt: null,
      team: inv.team,
      inviter: inv.inviter,
    })),
  };

  return <DepartmentDetailPage data={data} />;
}
