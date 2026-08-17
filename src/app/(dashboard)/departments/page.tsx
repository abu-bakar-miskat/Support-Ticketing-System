import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import type { ProfileMembership } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { DepartmentsClient } from "@/components/departments/departments-client";
import { MyDepartmentsClient, type MyDepartmentItem } from "@/components/departments/my-departments-client";
import type { DepartmentRow } from "@/components/settings/settings-departments-page";
import { readTenantBranding } from "@/lib/tenant-branding";

export const metadata = { title: "Departments — Ticketing System" };

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
          _count: { select: { teams: true, projects: true } },
          teams: {
            select: {
              id: true,
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
        prisma.team.count({ where: { tenantId } }),
        prisma.tenantMembership.count({ where: { tenantId, isActive: true } }),
        prisma.project.count({ where: { tenantId } }),
        prisma.ticket.count({ where: { tenantId, deletedAt: null, status: { not: "Live" } } }),
        prisma.joinRequest.count({
          where: {
            status: "pending",
            OR: [{ department: { tenantId } }, { team: { tenantId } }],
          },
        }),
      ]),
    ]);

    const [deptCount, teamCount, memberCount, projectCount, openTickets, pendingRequests] = orgStats;

    const departments: DepartmentRow[] = rawDepts.map((d) => ({
      id: d.id,
      name: d.name,
      isHub: d.isHub,
      type: d.type,
      _count: {
        teams: d._count.teams,
        projects: d._count.projects,
        members: d.teams.reduce((sum, t) => sum + t._count.memberships, 0),
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
        for (const team of d.teams) {
          for (const ms of team.memberships) {
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
        for (const team of d.teams) for (const ms of team.memberships) seen.add(ms.userId);
        return [...seen];
      })(),
    }));

    const tenantRow = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: true },
    });
    const tenantName =
      readTenantBranding(tenantRow?.branding).displayName ?? tenantRow?.name ?? null;

    return (
      <DepartmentsClient
        departments={departments}
        allUsers={users}
        orgStats={{ deptCount, teamCount, memberCount, projectCount, openTickets, pendingRequests }}
        tenantName={tenantName}
        tenantId={profile.activeTenantId ?? null}
      />
    );
  }

  // ── Non-admin: show all departments the user can access ──────────────────
  const managedIds: string[] = profile.managedDepartmentIds ?? [];
  const grantedIds: string[] = profile.grantedAccessDeptIds ?? [];
  const directMemberIds: string[] = profile.directMemberDeptIds ?? [];
  const membershipDeptIds = ((profile.memberships ?? []) as ProfileMembership[])
    .map((m) => m.team?.department?.id)
    .filter((id): id is string => Boolean(id));

  const allIds = [...new Set([...managedIds, ...grantedIds, ...directMemberIds, ...membershipDeptIds])];

  // Only one (or zero) accessible department — no need for a picker page
  if (allIds.length <= 1) redirect("/");

  const rawDepts = await prisma.department.findMany({
    where: { id: { in: allIds }, tenantId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { teams: true, projects: true } },
      teams: {
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
    teamCount: d._count.teams,
    projectCount: d._count.projects,
    memberCount: d.teams.reduce((sum, t) => sum + t._count.memberships, 0),
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
