import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { avatarColorFor } from "@/lib/board-data";
import {
  SettingsMembersPage,
  type MemberRow,
} from "@/components/settings/settings-members-page";

export const metadata = { title: "Members — Support Ticketing System" };

export default async function SettingsMembersRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isLead = profile.role === "sub_manager";

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
  // doNotAssign map: userId → list of { teamId, subDepartmentName, doNotAssign }
  const doNotAssignMap = new Map<string, { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[]>();

  if (isAdmin) {
    if (activeDeptId) {
      // Dept cookie active — show people on sub-departments in that department
      allMemberships = await (prisma.subDepartmentMembership as any)
        .findMany({
          where: { isActive: true, subDepartment: { departmentId: activeDeptId } },
          select: {
            userId: true,
            doNotAssign: true,
            role: true,
            subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
          },
        })
        .catch((e: unknown) => { console.error("[members/page] admin-dept subDepartmentMembership query failed:", e); return [] as any[]; });
      const deptUserIds = [...new Set(allMemberships.map((m: any) => m.userId))];
      profiles = await prisma.profile.findMany({
        where: { id: { in: deptUserIds }, deletedAt: null },
        orderBy: { name: "asc" },
      });
    } else {
      // No dept filter — show all members OF THIS TENANT
      allMemberships = await (prisma.subDepartmentMembership as any)
        .findMany({
          where: { isActive: true, subDepartment: { tenantId } },
          select: {
            userId: true,
            doNotAssign: true,
            role: true,
            subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
          },
        })
        .catch((e: unknown) => { console.error("[members/page] admin-all subDepartmentMembership query failed:", e); return [] as any[]; });
      // Sub-managers/agents are added via the sub-department flow, which creates a
      // SubDepartmentMembership but no TenantMembership. Union those users in so they
      // aren't dropped — otherwise only the tenant admin shows on the tenant-wide view.
      const memberUserIds = [...new Set(allMemberships.map((m: any) => m.userId))];
      profiles = await prisma.profile.findMany({
        where: {
          deletedAt: null,
          OR: [
            { tenantMemberships: { some: { tenantId, isActive: true } } },
            { id: { in: memberUserIds } },
          ],
        },
        orderBy: { name: "asc" },
      });
    }
  } else if (isManager) {
    // Managers see only members of their department(s)
    const deptIds = profileScope
      ? [profileScope.activeDeptId]
      : [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])];

    allMemberships = await (prisma.subDepartmentMembership as any)
      .findMany({
        where: {
          isActive: true,
          subDepartment: { departmentId: { in: deptIds } },
        },
        select: {
          userId: true,
          doNotAssign: true,
          role: true,
          subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        },
      })
      .catch((e: unknown) => { console.error("[members/page] manager subDepartmentMembership query failed:", e); return [] as any[]; });

    const allUserIds = [...new Set(allMemberships.map((m: any) => m.userId))];
    profiles = await prisma.profile.findMany({
      where: { id: { in: allUserIds }, deletedAt: null },
      orderBy: { name: "asc" },
    });
  } else {
    // Lead — scoped to their own subDepartment(s), handled in the isLead block below
    [profiles, allMemberships] = [[], []];
  }

  if (isLead) {
    // Lead sees all members of their own subDepartment(s)
    const leadSubDepartmentIds = profile.subDepartmentIds?.length
      ? profile.subDepartmentIds
      : profile.subDepartmentId ? [profile.subDepartmentId] : [];
    allMemberships = leadSubDepartmentIds.length
      ? await (prisma.subDepartmentMembership as any).findMany({
          where: { isActive: true, subDepartmentId: { in: leadSubDepartmentIds } },
          select: { userId: true, doNotAssign: true, role: true, subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } } },
        }).catch((e: unknown) => { console.error("[members/page] lead subDepartmentMembership query failed:", e); return [] as any[]; })
      : [];
    const memberUserIds = [...new Set(allMemberships.map((m: any) => m.userId))];
    profiles = await prisma.profile.findMany({ where: { id: { in: memberUserIds }, deletedAt: null }, orderBy: { name: "asc" } });
  }

  // A department-filtered admin view chooses *which people* to show from that
  // department, but the membership columns must still reveal every department and
  // subDepartment those people belong to. This is deliberately admin-only: managers
  // retain their existing department-scoped visibility.
  if (isAdmin && activeDeptId && profiles.length > 0) {
    const profileIds = profiles.map((member) => member.id);
    allMemberships = await (prisma.subDepartmentMembership as any).findMany({
      where: { userId: { in: profileIds }, isActive: true, subDepartment: { tenantId } },
      select: {
        userId: true,
        doNotAssign: true,
        role: true,
        subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
      },
    }).catch((e: unknown) => { console.error("[members/page] admin membership detail query failed:", e); return [] as any[]; });
  }

  // Fetch available subDepartments for the subDepartment assignment dropdown (admin/manager only).
  // When a department is active, only that department's subDepartments — required for invites + Add member.
  const availableSubDepartments = (isAdmin || isManager)
    ? await runAsSystem(() => prisma.subDepartment.findMany({
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
        select: { id: true, name: true, departmentId: true },
      }))
    : [];

  // Departments the caller can assign members to — powers the tenant-wide
  // Department dropdown + the Add-member department picker. Admins see every
  // department in the tenant; managers see only the ones they manage.
  const availableDepartments = (isAdmin || isManager)
    ? await runAsSystem(() => prisma.department.findMany({
        where: isAdmin
          ? { tenantId }
          : (() => {
              const deptIds = [
                ...(profile.managedDepartmentIds ?? []),
                ...(profile.grantedAccessDeptIds ?? []),
              ];
              return deptIds.length ? { id: { in: deptIds } } : { id: { in: [] as string[] } };
            })(),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }))
    : [];

  // Role precedence — the Role column shows a user's *effective* role, i.e. the
  // highest role they hold anywhere. A sub-department "sub_manager" grant lives on
  // SubDepartmentMembership.role, not Profile.role, so without this the column would
  // keep showing "agent" after promoting someone to sub-manager of a sub-department.
  const ROLE_RANK: Record<string, number> = { admin: 4, manager: 3, sub_manager: 2, agent: 1 };
  const membershipRoleByUser = new Map<string, string>();

  const subDepartmentsByUser = new Map<string, string[]>();
  const departmentsByUser = new Map<string, { id: string; name: string }[]>();
  const membershipsByUser = new Map<string, { subDepartmentId: string; subDepartmentName: string; departmentId: string; departmentName: string; doNotAssign: boolean }[]>();
  const subDepartmentIdByUser = new Map<string, string>();
  const deptByUser = new Map<string, string>();
  const deptIdByUser = new Map<string, string>();
  const nativeUserIds = new Set<string>();
  for (const m of allMemberships as any[]) {
    const list = subDepartmentsByUser.get(m.userId) ?? [];
    list.push(m.subDepartment.name);
    subDepartmentsByUser.set(m.userId, list);
    const departments = departmentsByUser.get(m.userId) ?? [];
    if (m.subDepartment?.department?.id && !departments.some((department) => department.id === m.subDepartment.department.id)) {
      departments.push({ id: m.subDepartment.department.id, name: m.subDepartment.department.name });
      departmentsByUser.set(m.userId, departments);
    }
    if (!subDepartmentIdByUser.has(m.userId) && m.subDepartment?.id) {
      subDepartmentIdByUser.set(m.userId, m.subDepartment.id);
    }
    if (m.subDepartment?.department?.name && !deptByUser.has(m.userId)) {
      deptByUser.set(m.userId, m.subDepartment.department.name);
    }
    if (m.subDepartment?.department?.id && !deptIdByUser.has(m.userId)) {
      deptIdByUser.set(m.userId, m.subDepartment.department.id);
    }
    nativeUserIds.add(m.userId);
    // Track the highest sub-department role for the effective-role display.
    if (m.role) {
      const prev = membershipRoleByUser.get(m.userId);
      if (!prev || (ROLE_RANK[m.role] ?? 0) > (ROLE_RANK[prev] ?? 0)) {
        membershipRoleByUser.set(m.userId, m.role);
      }
    }
    // Build doNotAssign map per user → list of subDepartment memberships
    if (m.subDepartment?.id) {
      const existing = doNotAssignMap.get(m.userId) ?? [];
      existing.push({ subDepartmentId: m.subDepartment.id, subDepartmentName: m.subDepartment.name, doNotAssign: m.doNotAssign ?? false });
      doNotAssignMap.set(m.userId, existing);
      const memberships = membershipsByUser.get(m.userId) ?? [];
      memberships.push({ subDepartmentId: m.subDepartment.id, subDepartmentName: m.subDepartment.name, departmentId: m.subDepartment.department.id, departmentName: m.subDepartment.department.name, doNotAssign: m.doNotAssign ?? false });
      membershipsByUser.set(m.userId, memberships);
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
            subDepartment: { select: { name: true, department: { select: { id: true, name: true } } } },
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
      // Their real, native subDepartment — shown read-only; a manager here can't reassign a
      // guest's subDepartment since it belongs to a different department than this page manages.
      subDepartments: g.user.subDepartment?.name ? [g.user.subDepartment.name] : [],
      subDepartmentId: null,
      department: g.user.subDepartment?.department?.name ?? null,
      // The department they were granted cross-access to (this page's context) — used to
      // target the "revoke access" action, distinct from `department` (their home dept, shown above).
      departmentId: activeDeptId,
      isCrossAccess: true,
    }));
  }

  const activeDept = activeDeptId
    ? await runAsSystem(() =>
        prisma.department.findUnique({ where: { id: activeDeptId }, select: { name: true } }),
      )
    : null;

  // ─── Invited members (TenantInvites) ────────────────────────────────────────
  // People who were emailed an invite but aren't accounts yet. Shown with their
  // lifecycle status so admins/managers can see who's still pending. Scoping
  // mirrors the member-visibility rules above so each role only sees invites for
  // departments/sub-departments they manage.
  const inviteScopeDeptIds = new Set<string>();
  const inviteScopeSubDeptIds = new Set<string>();
  const seesAllTenantInvites = isAdmin && !activeDeptId;
  if (isAdmin && activeDeptId) {
    inviteScopeDeptIds.add(activeDeptId);
  } else if (isManager) {
    const managerDeptIds = profileScope
      ? [profileScope.activeDeptId]
      : [...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])];
    for (const id of managerDeptIds) if (id) inviteScopeDeptIds.add(id);
  } else if (isLead) {
    const leadSubIds = profile.subDepartmentIds?.length
      ? profile.subDepartmentIds
      : profile.subDepartmentId ? [profile.subDepartmentId] : [];
    for (const id of leadSubIds) inviteScopeSubDeptIds.add(id);
  }

  const rawInvites = await runAsSystem(() =>
    (prisma.tenantInvite as any).findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        departmentIds: true,
        subDepartmentId: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        inviter: { select: { name: true } },
      },
    }),
  ).catch((e: unknown) => { console.error("[members/page] tenantInvite query failed:", e); return [] as any[]; });

  // Resolve department + sub-department names referenced by the invites so the
  // "Invited to" column reads human names, not ids.
  const inviteDeptIds = new Set<string>();
  const inviteSubDeptIds = new Set<string>();
  for (const inv of rawInvites as any[]) {
    if (Array.isArray(inv.departmentIds)) for (const d of inv.departmentIds) if (typeof d === "string") inviteDeptIds.add(d);
    if (inv.subDepartmentId) inviteSubDeptIds.add(inv.subDepartmentId);
  }
  const [inviteDepts, inviteSubDepts] = await Promise.all([
    inviteDeptIds.size
      ? runAsSystem(() => prisma.department.findMany({ where: { id: { in: [...inviteDeptIds] } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
    inviteSubDeptIds.size
      ? runAsSystem(() => prisma.subDepartment.findMany({ where: { id: { in: [...inviteSubDeptIds] } }, select: { id: true, name: true, departmentId: true } }))
      : Promise.resolve([] as { id: string; name: string; departmentId: string }[]),
  ]);
  const deptNameById = new Map(inviteDepts.map((d) => [d.id, d.name]));
  const subDeptById = new Map(inviteSubDepts.map((s) => [s.id, s]));

  const now = Date.now();
  const invites = (rawInvites as any[])
    .filter((inv) => {
      if (seesAllTenantInvites) return true;
      const deptIds: string[] = Array.isArray(inv.departmentIds) ? inv.departmentIds.filter((d: unknown): d is string => typeof d === "string") : [];
      if (deptIds.some((d) => inviteScopeDeptIds.has(d))) return true;
      if (inv.subDepartmentId) {
        if (inviteScopeSubDeptIds.has(inv.subDepartmentId)) return true;
        const sub = subDeptById.get(inv.subDepartmentId);
        if (sub && inviteScopeDeptIds.has(sub.departmentId)) return true;
      }
      return false;
    })
    .map((inv) => {
      const status: "accepted" | "revoked" | "expired" | "pending" = inv.acceptedAt
        ? "accepted"
        : inv.revokedAt
          ? "revoked"
          : inv.expiresAt.getTime() < now
            ? "expired"
            : "pending";
      const deptIds: string[] = Array.isArray(inv.departmentIds) ? inv.departmentIds.filter((d: unknown): d is string => typeof d === "string") : [];
      let target: string | null = null;
      if (inv.role === "admin") target = "Tenant-wide";
      else if (inv.subDepartmentId) {
        const sub = subDeptById.get(inv.subDepartmentId);
        const deptName = sub ? deptNameById.get(sub.departmentId) : null;
        target = sub ? (deptName ? `${deptName} › ${sub.name}` : sub.name) : null;
      } else if (deptIds.length) {
        target = deptIds.map((d) => deptNameById.get(d) ?? "").filter(Boolean).join(", ") || null;
      }
      return {
        id: inv.id as string,
        email: inv.email as string,
        role: inv.role as MemberRow["role"],
        status,
        target,
        invitedBy: inv.inviter?.name ?? null,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString(),
      };
    })
    // Only surface invites still awaiting acceptance — accepted people already
    // appear in the members table above; expired/revoked are noise here.
    .filter((inv) => inv.status === "pending");

  const members: MemberRow[] = [
    ...profiles.map((p: { id: string; name: string; email: string; avatarUrl?: string | null; role: string; subDepartmentId?: string | null; location?: string | null; timezone?: string | null; isActive?: boolean | null }) => {
      // Effective role = the higher of the global Profile.role and their highest
      // sub-department membership role (see ROLE_RANK note above).
      const membershipRole = membershipRoleByUser.get(p.id);
      const effectiveRole =
        membershipRole && (ROLE_RANK[membershipRole] ?? 0) > (ROLE_RANK[p.role] ?? 0)
          ? membershipRole
          : p.role;
      return {
      id: p.id,
      name: p.name,
      email: p.email,
      color: avatarColorFor(p.name),
      avatarUrl: p.avatarUrl ?? null,
      role: effectiveRole as MemberRow["role"],
      location: p.location ?? null,
      timezone: p.timezone ?? null,
      isActive: p.isActive ?? true,
      subDepartments: subDepartmentsByUser.get(p.id) ?? [],
      subDepartmentId: p.subDepartmentId ?? subDepartmentIdByUser.get(p.id) ?? null,
      department: deptByUser.get(p.id) ?? null,
      departmentId: deptIdByUser.get(p.id) ?? null,
      isCrossAccess: false,
      subDepartmentMemberships: doNotAssignMap.get(p.id) ?? [],
      departments: departmentsByUser.get(p.id) ?? [],
      memberships: membershipsByUser.get(p.id) ?? [],
      };
    }),
    ...crossAccessRows,
  ];

  return (
    <SettingsMembersPage
      members={members}
      isAdmin={isAdmin}
      isManager={isManager}
      availableSubDepartments={availableSubDepartments}
      availableDepartments={availableDepartments}
      currentUserId={profile.id}
      departmentId={activeDeptId}
      departmentName={activeDept?.name ?? null}
      tenantId={profile.activeTenantId ?? null}
      invites={invites}
    />
  );
}
