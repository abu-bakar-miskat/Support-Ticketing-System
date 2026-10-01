import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { avatarColorFor } from "@/lib/board-data";
import {
  DepartmentDetailPage,
  type DepartmentDetailData,
} from "@/components/department/department-detail-page";

export const metadata = { title: "Department — Global Support Portal" };

export default async function DepartmentRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isSubManager = profile.role === "sub_manager";
  if (!isAdmin && !isManager && !isSubManager) redirect("/settings");

  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  if (!activeDeptId) redirect("/departments");

  // activeDeptId comes from the caller's resolved dept scope (access already
  // verified) — run unscoped to skip the per-query scope waterfall.
  const [dept, managers, memberships, accessGrants, availableSubDepartments, allUsers, pendingInvites, joinRequests] =
    await runAsSystem(() => Promise.all([
      prisma.department.findUnique({
        where: { id: activeDeptId },
        select: {
          id: true,
          name: true,
          isHub: true,
          type: true,
          _count: { select: { subDepartments: true, projects: true } },
        },
      }),
      prisma.departmentManager.findMany({
        where: { departmentId: activeDeptId },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true, location: true, timezone: true } } },
        orderBy: { assignedAt: "asc" },
      }),
      prisma.subDepartmentMembership.findMany({
        // Include inactive memberships too — a member whose invite hasn't been
        // accepted (isActive: false) still belongs in the table, shown as "Pending".
        where: { subDepartment: { departmentId: activeDeptId } },
        select: {
          userId: true,
          role: true,
          doNotAssign: true,
          isActive: true,
          subDepartment: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true, subDepartmentId: true, location: true, timezone: true, isActive: true } },
        },
      }),
      prisma.departmentAccess.findMany({
        where: { departmentId: activeDeptId },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
          grantor: { select: { id: true, name: true } },
        },
        orderBy: { grantedAt: "desc" },
      }),
      prisma.subDepartment.findMany({
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
          subDepartment: { select: { id: true, name: true } },
          inviter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Pending join requests targeting this department directly OR any of its
      // sub-departments (onboarding creates sub-department requests). `joinRequest`
      // isn't tenant-scoped, and the caller is already an admin/manager of this
      // department, so this listing is safe.
      prisma.joinRequest.findMany({
        where: {
          status: "pending",
          OR: [
            { departmentId: activeDeptId },
            { subDepartment: { departmentId: activeDeptId } },
          ],
        },
        orderBy: { requestedAt: "asc" },
        select: {
          id: true,
          requestedAt: true,
          departmentId: true,
          subDepartmentId: true,
          message: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          subDepartment: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      }),
    ]));

  if (!dept) redirect("/departments");

  // A sub-manager is scoped to the team(s) they belong to: the roster shows only
  // those sub-departments and their members, not the whole department. Admins and
  // managers keep the full department view (ownSubDeptIds stays null).
  const ownSubDeptIds = isSubManager
    ? new Set(memberships.filter((m) => m.userId === profile.id).map((m) => m.subDepartment.id))
    : null;
  const scopedMemberships = ownSubDeptIds
    ? memberships.filter((m) => ownSubDeptIds.has(m.subDepartment.id))
    : memberships;
  const scopedSubDepartments = ownSubDeptIds
    ? availableSubDepartments.filter((s) => ownSubDeptIds.has(s.id))
    : availableSubDepartments;

  const managerUserIds = new Set(managers.map((m) => m.userId));

  // SubDepartment names (within this department) per user, and their team-membership id for the
  // team-change dropdown's "current" value.
  const subDepartmentNamesByUser = new Map<string, string[]>();
  const subDepartmentIdByUser = new Map<string, string>();
  // Source-of-truth role per member: their SubDepartmentMembership.role within this
  // department. Role changes write here (see changeRoles / synchronizeLegacyRoleAssignments),
  // whereas Profile.role is a stale legacy column never updated on a role change — reading
  // it would make an edit appear to vanish on reload. sub_manager outranks agent when a
  // member belongs to multiple sub-departments in this department.
  const subDepartmentRoleByUser = new Map<string, string>();
  const subDepartmentMembershipsByUser = new Map<string, { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean; accepted: boolean }[]>();
  for (const m of scopedMemberships) {
    const list = subDepartmentNamesByUser.get(m.userId) ?? [];
    list.push(m.subDepartment.name);
    subDepartmentNamesByUser.set(m.userId, list);
    if (!subDepartmentIdByUser.has(m.userId)) subDepartmentIdByUser.set(m.userId, m.subDepartment.id);
    if (m.role === "sub_manager" || !subDepartmentRoleByUser.has(m.userId)) {
      subDepartmentRoleByUser.set(m.userId, m.role);
    }
    const dna = subDepartmentMembershipsByUser.get(m.userId) ?? [];
    dna.push({ subDepartmentId: m.subDepartment.id, subDepartmentName: m.subDepartment.name, doNotAssign: m.doNotAssign ?? false, accepted: m.isActive ?? true });
    subDepartmentMembershipsByUser.set(m.userId, dna);
  }

  const nativeUserIds = new Set(scopedMemberships.map((m) => m.userId));

  // Members table = people on sub-departments in this department, minus managers (shown separately).
  const memberProfilesById = new Map<string, {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    subDepartmentId: string | null;
    location: string | null;
    timezone: string | null;
    isActive: boolean;
  }>();
  for (const m of scopedMemberships) {
    if (managerUserIds.has(m.userId)) continue;
    memberProfilesById.set(m.userId, {
      ...m.user,
      // Display the sub-department membership role (source of truth), not the
      // stale Profile.role column — see subDepartmentRoleByUser above.
      role: subDepartmentRoleByUser.get(m.userId) ?? m.user.role,
      avatarUrl: m.user.avatarUrl ?? null,
      location: m.user.location ?? null,
      timezone: m.user.timezone ?? null,
      isActive: m.user.isActive ?? true,
    });
  }

  const data: DepartmentDetailData = {
    id: dept.id,
    name: dept.name,
    isHub: dept.isHub,
    subDepartmentCount: ownSubDeptIds ? scopedSubDepartments.length : dept._count.subDepartments,
    projectCount: dept._count.projects,
    managerCount: managerUserIds.size,
    memberCount: memberProfilesById.size,
    isAdmin,
    isSubManager,
    availableSubDepartments: scopedSubDepartments,
    allUsers: allUsers.map((u) => ({ ...u, avatarUrl: u.avatarUrl ?? null })),
    // Super Admins control any department's feature allowlist (role-hierarchy.md).
    canControlFeatures: profile.isSuperAdmin,
    managers: managers.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
      color: avatarColorFor(m.user.name),
      location: m.user.location ?? null,
      timezone: m.user.timezone ?? null,
      subDepartmentMemberships: subDepartmentMembershipsByUser.get(m.userId) ?? [],
    })),
    members: [...memberProfilesById.values()].map((p) => ({
      userId: p.id,
      name: p.name,
      email: p.email,
      avatarUrl: p.avatarUrl,
      color: avatarColorFor(p.name),
      role: p.role,
      subDepartmentNames: subDepartmentNamesByUser.get(p.id) ?? [],
      subDepartmentId: p.subDepartmentId ?? subDepartmentIdByUser.get(p.id) ?? null,
      source: "native" as const,
      location: p.location,
      timezone: p.timezone,
      isActive: p.isActive,
      subDepartmentMemberships: subDepartmentMembershipsByUser.get(p.id) ?? [],
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
      subDepartment: inv.subDepartment,
      inviter: inv.inviter,
    })),
    joinRequests: joinRequests.map((r) => {
      const isSub = r.subDepartmentId != null;
      return {
        id: r.id,
        kind: isSub ? ("sub" as const) : ("dept" as const),
        // Approval targets the sub-department for a team request, else the department.
        targetId: isSub ? r.subDepartmentId! : (r.departmentId ?? dept.id),
        targetName: isSub ? (r.subDepartment?.name ?? "—") : (r.department?.name ?? dept.name),
        message: r.message,
        requestedAt: r.requestedAt.toISOString(),
        user: {
          id: r.user.id,
          name: r.user.name,
          email: r.user.email,
          avatarUrl: r.user.avatarUrl ?? null,
        },
      };
    }),
  };

  return <DepartmentDetailPage data={data} />;
}
