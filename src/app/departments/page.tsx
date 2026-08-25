import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import type { ProfileMembership } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import { DepartmentsClient } from "@/components/departments/departments-client";
import { MyDepartmentsClient, type MyDepartmentItem } from "@/components/departments/my-departments-client";
import type { DepartmentRow } from "@/components/settings/settings-departments-page";
import type { MemberRow } from "@/components/settings/settings-members-page";
import { readTenantBranding } from "@/lib/tenant-branding";

export const metadata = { title: "Departments — Support Ticketing System" };

export default async function DepartmentsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Everything on this page is scoped to the active tenant. Sentinel matches no
  // rows if there's somehow no active tenant, so nothing leaks across tenants.
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  // ── Admin: full org management view ──────────────────────────────────────
  if (profile.role === "admin") {
    const [rawDepts, users, orgStats] = await Promise.all([
      prisma.department.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { subDepartments: true, projects: true } },
          subDepartments: {
            select: {
              id: true,
              name: true,
              _count: { select: { memberships: { where: { isActive: true } } } },
              memberships: {
                where: { isActive: true },
                select: { userId: true, user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
              },
            },
          },
          managers: {
            include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
            orderBy: { assignedAt: "asc" },
          },
          accessGrants: {
            select: {
              id: true,
              userId: true,
              expiresAt: true,
              reason: true,
              grantedAt: true,
              fullAccess: true,
              user: { select: { id: true, name: true, email: true, role: true } },
              grantor: { select: { id: true, name: true } },
            },
            orderBy: { grantedAt: "desc" },
          },
          directMembers: {
            include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
            orderBy: { addedAt: "asc" },
          },
        },
      }),
      prisma.profile.findMany({
        where: { tenantMemberships: { some: { tenantId, isActive: true } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, role: true },
      }),
      Promise.all([
        prisma.department.count({ where: { tenantId } }),
        prisma.subDepartment.count({ where: { tenantId } }),
        prisma.tenantMembership.count({ where: { tenantId, isActive: true } }),
        prisma.project.count({ where: { tenantId } }),
        prisma.ticket.count({ where: { tenantId, deletedAt: null, status: { not: "Live" } } }),
        prisma.joinRequest.count({
          where: {
            status: "pending",
            OR: [{ department: { tenantId } }, { subDepartment: { tenantId } }],
          },
        }),
      ]),
    ]);

    const [deptCount, subDepartmentCount, memberCount, projectCount, openTickets, pendingRequests] = orgStats;

    // ── Per-department shared-mailbox usage (tenant-wide) ────────────────────
    const mailboxGroups = await prisma.mailboxConnection.groupBy({
      by: ["departmentId", "status"],
      where: { tenantId },
      _count: { _all: true },
    });
    const mailboxByDept = new Map<string, { total: number; active: number; issues: number }>();
    for (const g of mailboxGroups) {
      const entry = mailboxByDept.get(g.departmentId) ?? { total: 0, active: 0, issues: 0 };
      const count = g._count._all;
      entry.total += count;
      if (g.status === "ACTIVE") entry.active += count;
      else entry.issues += count; // AUTH_ERROR + UNREACHABLE
      mailboxByDept.set(g.departmentId, entry);
    }

    // ── Tenant-wide user list, grouped by department + sub-department ────────
    const [tenantProfiles, tenantMemberships, tenantDirectDeptMembers] = await Promise.all([
      prisma.profile.findMany({
        where: { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } },
        orderBy: { name: "asc" },
      }),
      (prisma.subDepartmentMembership as any).findMany({
        where: { isActive: true, subDepartment: { tenantId } },
        select: {
          userId: true,
          doNotAssign: true,
          subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        },
      }),
      (prisma.departmentMember as any).findMany({
        where: { department: { tenantId } },
        select: { userId: true, department: { select: { id: true, name: true } } },
      }),
    ]);

    const subDepartmentsByUser = new Map<string, string[]>();
    const subDepartmentIdByUser = new Map<string, string>();
    const deptByUser = new Map<string, string>();
    const deptIdByUser = new Map<string, string>();
    const doNotAssignMap = new Map<string, { subDepartmentId: string; subDepartmentName: string; doNotAssign: boolean }[]>();
    for (const m of tenantMemberships as any[]) {
      const list = subDepartmentsByUser.get(m.userId) ?? [];
      list.push(m.subDepartment.name);
      subDepartmentsByUser.set(m.userId, list);
      if (!subDepartmentIdByUser.has(m.userId) && m.subDepartment?.id) {
        subDepartmentIdByUser.set(m.userId, m.subDepartment.id);
      }
      if (m.subDepartment?.department?.name && !deptByUser.has(m.userId)) {
        deptByUser.set(m.userId, m.subDepartment.department.name);
      }
      if (m.subDepartment?.department?.id && !deptIdByUser.has(m.userId)) {
        deptIdByUser.set(m.userId, m.subDepartment.department.id);
      }
      if (m.subDepartment?.id) {
        const existing = doNotAssignMap.get(m.userId) ?? [];
        existing.push({ subDepartmentId: m.subDepartment.id, subDepartmentName: m.subDepartment.name, doNotAssign: m.doNotAssign ?? false });
        doNotAssignMap.set(m.userId, existing);
      }
    }
    for (const dm of tenantDirectDeptMembers as { userId: string; department: { id: string; name: string } }[]) {
      if (!deptByUser.has(dm.userId)) deptByUser.set(dm.userId, dm.department.name);
      if (!deptIdByUser.has(dm.userId)) deptIdByUser.set(dm.userId, dm.department.id);
    }

    const tenantMembers: MemberRow[] = tenantProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      color: avatarColorFor(p.name),
      avatarUrl: p.avatarUrl ?? null,
      role: p.role,
      location: p.location ?? null,
      timezone: p.timezone ?? null,
      isActive: p.isActive ?? true,
      subDepartments: subDepartmentsByUser.get(p.id) ?? [],
      subDepartmentId: p.subDepartmentId ?? subDepartmentIdByUser.get(p.id) ?? null,
      department: deptByUser.get(p.id) ?? null,
      departmentId: deptIdByUser.get(p.id) ?? null,
      isCrossAccess: false,
      subDepartmentMemberships: doNotAssignMap.get(p.id) ?? [],
    }));

    const departments: DepartmentRow[] = rawDepts.map((d) => ({
      id: d.id,
      name: d.name,
      isHub: d.isHub,
      type: d.type,
      _count: {
        subDepartments: d._count.subDepartments,
        projects: d._count.projects,
        members: d.subDepartments.reduce((sum, t) => sum + t._count.memberships, 0),
      },
      managers: d.managers.map((m) => ({
        id: m.id,
        userId: m.userId,
        user: { id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role },
      })),
      accessGrants: d.accessGrants.map((g) => ({
        id: g.id,
        userId: g.userId,
        expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
        reason: g.reason,
        grantedAt: g.grantedAt.toISOString(),
        fullAccess: g.fullAccess,
        user: { id: g.user.id, name: g.user.name, email: g.user.email, role: g.user.role },
        grantor: { id: g.grantor.id, name: g.grantor.name },
      })),
      directMembers: d.directMembers.map((m) => ({
        id: m.id,
        userId: m.userId,
        user: { id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, avatarUrl: m.user.avatarUrl ?? null },
      })),
      nativeMembers: (() => {
        const seen = new Set<string>();
        const result: { userId: string; user: { id: string; name: string; email: string; role: string; avatarUrl: string | null } }[] = [];
        for (const subDepartment of d.subDepartments) {
          for (const ms of subDepartment.memberships) {
            if (!seen.has(ms.userId)) {
              seen.add(ms.userId);
              result.push({ userId: ms.userId, user: { ...ms.user, avatarUrl: ms.user.avatarUrl ?? null } });
            }
          }
        }
        return result;
      })(),
      memberIds: (() => {
        const seen = new Set<string>();
        for (const subDepartment of d.subDepartments) for (const ms of subDepartment.memberships) seen.add(ms.userId);
        return [...seen];
      })(),
      subDepartments: d.subDepartments.map((t) => ({ id: t.id, name: t.name })),
    }));

    const tenantRow = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: true },
    });
    const tenantName =
      readTenantBranding(tenantRow?.branding).displayName ?? tenantRow?.name ?? null;

    const mailboxUsage = rawDepts.map((d) => {
      const u = mailboxByDept.get(d.id) ?? { total: 0, active: 0, issues: 0 };
      return { departmentId: d.id, name: d.name, total: u.total, active: u.active, issues: u.issues };
    });

    return (
      <DepartmentsClient
        departments={departments}
        allUsers={users}
        orgStats={{ deptCount, subDepartmentCount, memberCount, projectCount, openTickets, pendingRequests }}
        tenantName={tenantName}
        tenantId={profile.activeTenantId ?? null}
        members={tenantMembers}
        currentUserId={profile.id}
        mailboxUsage={mailboxUsage}
      />
    );
  }

  // ── Non-admin: show all departments the user can access ──────────────────
  const managedIds: string[] = profile.managedDepartmentIds ?? [];
  const grantedIds: string[] = profile.grantedAccessDeptIds ?? [];
  const directMemberIds: string[] = profile.directMemberDeptIds ?? [];
  const membershipDeptIds = ((profile.memberships ?? []) as ProfileMembership[])
    .map((m) => m.subDepartment?.department?.id)
    .filter((id): id is string => Boolean(id));

  const allIds = [...new Set([...managedIds, ...grantedIds, ...directMemberIds, ...membershipDeptIds])];

  // Only one (or zero) accessible department — no need for a picker page
  if (allIds.length <= 1) redirect("/");

  const rawDepts = await prisma.department.findMany({
    where: { id: { in: allIds }, tenantId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { subDepartments: true, projects: true } },
      subDepartments: {
        select: {
          _count: { select: { memberships: { where: { isActive: true } } } },
        },
      },
    },
  });

  const myDepts: MyDepartmentItem[] = rawDepts.map((d) => ({
    id: d.id,
    name: d.name,
    isHub: d.isHub,
    subDepartmentCount: d._count.subDepartments,
    projectCount: d._count.projects,
    memberCount: d.subDepartments.reduce((sum, t) => sum + t._count.memberships, 0),
    accessType: managedIds.includes(d.id)
      ? "manager"
      : grantedIds.includes(d.id)
        ? "guest"
        : directMemberIds.includes(d.id)
          ? "member"
          : "member",
  }));

  return <MyDepartmentsClient departments={myDepts} />;
}
