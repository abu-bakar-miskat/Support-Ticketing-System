import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getProfile } from "@/lib/profile";
import { X_TENANT_SLUG_HEADER } from "@/lib/tenant-path";
import type { ProfileMembership } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import { DepartmentsClient } from "@/components/departments/departments-client";
import type { DepartmentMailboxUsage } from "@/components/departments/departments-mailboxes";
import { MyDepartmentsClient, type MyDepartmentItem } from "@/components/departments/my-departments-client";
import type { DepartmentRow, TemplateOption } from "@/components/settings/settings-departments-page";
import type { MemberRow } from "@/components/settings/settings-members-page";
import { readTenantBranding } from "@/lib/tenant-branding";
import { listCatalogueForTenant } from "@/lib/template-catalogue";
import { departmentTypeForTemplateSlug } from "@/lib/system-templates";
import { runAsSystem } from "@/lib/request-scope";

// Tab title reflects the active tenant so multiple tenant tabs are
// distinguishable (e.g. "Pen Global BD · Departments").
export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfile();
  const tenantId = profile?.activeTenantId ?? null;
  let tenantName: string | null = null;
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: true },
    });
    tenantName = readTenantBranding(tenant?.branding).displayName ?? tenant?.name ?? null;
  }
  return {
    title: tenantName ? `${tenantName} · Departments` : "Departments — Global Support Portal",
  };
}

export default async function DepartmentsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Everything on this page is scoped to the active tenant. Sentinel matches no
  // rows if there's somehow no active tenant, so nothing leaks across tenants.
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  // ── Admin: full org management view ──────────────────────────────────────
  // Tenant admins and super admins who have switched into this tenant (their
  // profile.role resolves to "admin" via getProfile) get the org management view.
  if (profile.role === "admin") {
    // Every query below is explicitly bound to the active tenantId, so run
    // unscoped — the per-query scope waterfall would otherwise stall this
    // page (the admin landing) for minutes on the shared pooler.
    const [rawDepts, users, orgStats] = await runAsSystem(() => Promise.all([
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
                select: { userId: true, role: true, user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
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
        prisma.project.count({ where: { tenantId } }),
        prisma.ticket.count({ where: { tenantId, deletedAt: null, status: { not: "Live" } } }),
        prisma.joinRequest.count({
          where: {
            status: "pending",
            OR: [{ department: { tenantId } }, { subDepartment: { tenantId } }],
          },
        }),
      ]),
    ]));

    const [deptCount, subDepartmentCount, projectCount, openTickets, pendingRequests] = orgStats;

    // ── Per-department shared-mailbox usage (tenant-wide) ────────────────────
    const mailboxGroups = await runAsSystem(() =>
      prisma.mailboxConnection.groupBy({
        by: ["departmentId", "status"],
        where: { tenantId },
        _count: { _all: true },
        _max: { lastCheckedAt: true },
      }),
    );
    const mailboxByDept = new Map<
      string,
      { total: number; active: number; issues: number; lastCheckedAt: Date | null }
    >();
    for (const g of mailboxGroups) {
      const entry = mailboxByDept.get(g.departmentId) ?? { total: 0, active: 0, issues: 0, lastCheckedAt: null };
      const count = g._count._all;
      entry.total += count;
      if (g.status === "ACTIVE") entry.active += count;
      else entry.issues += count; // AUTH_ERROR + UNREACHABLE
      const checked = g._max.lastCheckedAt;
      if (checked && (!entry.lastCheckedAt || checked > entry.lastCheckedAt)) {
        entry.lastCheckedAt = checked;
      }
      mailboxByDept.set(g.departmentId, entry);
    }

    // ── Tenant-wide user list, grouped by department + sub-department ────────
    const [tenantProfiles, tenantMemberships] = await runAsSystem(() => Promise.all([
      prisma.profile.findMany({
        where: { deletedAt: null, tenantMemberships: { some: { tenantId, isActive: true } } },
        orderBy: { name: "asc" },
      }),
      (prisma.subDepartmentMembership as any).findMany({
        where: { isActive: true, subDepartment: { tenantId }, user: { deletedAt: null } },
        select: {
          userId: true,
          doNotAssign: true,
          subDepartment: { select: { id: true, name: true, department: { select: { id: true, name: true } } } },
        },
      }),
    ]));

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

    // Distinct member count: tenant memberships + people on sub-departments.
    // Managers get whole-dept access via DepartmentManager; agents join via sub-departments only.
    const memberIdSet = new Set<string>();
    for (const p of tenantProfiles) memberIdSet.add(p.id);
    for (const m of tenantMemberships as { userId: string }[]) memberIdSet.add(m.userId);
    const memberCount = memberIdSet.size;
    const managerCount = new Set(rawDepts.flatMap((d) => d.managers.map((m) => m.userId))).size;

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
      setupCompletedAt: d.setupCompletedAt ? d.setupCompletedAt.toISOString() : null,
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
      directMembers: [],
      nativeMembers: (() => {
        const seen = new Set<string>();
        const result: { userId: string; role: string; user: { id: string; name: string; email: string; role: string; avatarUrl: string | null } }[] = [];
        for (const subDepartment of d.subDepartments) {
          for (const ms of subDepartment.memberships) {
            if (!seen.has(ms.userId)) {
              seen.add(ms.userId);
              result.push({ userId: ms.userId, role: ms.role, user: { ...ms.user, avatarUrl: ms.user.avatarUrl ?? null } });
            }
          }
        }
        return result;
      })(),
      membersBySubDepartment: d.subDepartments.map((sub) => ({
        subDepartmentId: sub.id,
        subDepartmentName: sub.name,
        members: sub.memberships.map((ms) => ({
          userId: ms.userId,
          role: ms.role,
          user: { ...ms.user, avatarUrl: ms.user.avatarUrl ?? null },
        })),
      })),
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

    // Sub-department links must carry the department in the URL (/<tenant>/<dept>/…).
    const tenantSlug = (await headers()).get(X_TENANT_SLUG_HEADER);

    const mailboxUsage: DepartmentMailboxUsage[] = rawDepts.map((d) => {
      const u = mailboxByDept.get(d.id) ?? { total: 0, active: 0, issues: 0, lastCheckedAt: null };
      return {
        departmentId: d.id,
        name: d.name,
        basePath: tenantSlug ? `/${tenantSlug}/${d.slug}` : "",
        subDepartments: d.subDepartments.map((subDepartment) => ({
          id: subDepartment.id,
          name: subDepartment.name,
          mailboxes: [],
        })),
        total: u.total,
        active: u.active,
        issues: u.issues,
        lastCheckedAt: u.lastCheckedAt ? u.lastCheckedAt.toISOString() : null,
      };
    });

    // Templates available to this tenant so the New Department modal can offer
    // them instead of the built-in department-type list (matches /settings/departments).
    const catalogue = await runAsSystem(() => listCatalogueForTenant(tenantId));
    const templateOptions: TemplateOption[] = catalogue.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      featureCount: t.features.length,
      status: t.status,
      departmentType: departmentTypeForTemplateSlug(t.slug),
    }));

    return (
      <DepartmentsClient
        departments={departments}
        allUsers={users}
        orgStats={{ deptCount, subDepartmentCount, managerCount, memberCount, projectCount, openTickets, pendingRequests }}
        tenantName={tenantName}
        tenantId={profile.activeTenantId ?? null}
        members={tenantMembers}
        currentUserId={profile.id}
        mailboxUsage={mailboxUsage}
        templateOptions={templateOptions}
      />
    );
  }

  // ── Non-admin: show all departments the user can access ──────────────────
  const managedIds: string[] = profile.managedDepartmentIds ?? [];
  const grantedIds: string[] = profile.grantedAccessDeptIds ?? [];
  const membershipDeptIds = ((profile.memberships ?? []) as ProfileMembership[])
    .map((m) => m.subDepartment?.department?.id)
    .filter((id): id is string => Boolean(id));

  const allIds = [...new Set([...managedIds, ...grantedIds, ...membershipDeptIds])];

  // Exactly one accessible department — skip the picker and drop the user
  // straight into that department's workspace. Redirect to the dept-scoped
  // URL (/<tenant>/<dept>), NOT to "/": a bare "/" has no department in the
  // URL, and when the active-department cookie is missing/stale the proxy
  // bounces "/" → /<tenant> → /<tenant>/departments, landing back here and
  // redirecting to "/" again — an infinite loop (clearing cookies only masked
  // it by re-seeding a valid cookie). Carrying the dept slug in the URL makes
  // the destination resolve without any cookie dependency.
  if (allIds.length === 1) {
    const headerStore = await headers();
    const tenantSlug = headerStore.get(X_TENANT_SLUG_HEADER);
    const onlyDept = await runAsSystem(() =>
      prisma.department.findUnique({
        where: { id: allIds[0]! },
        select: { slug: true },
      }),
    );
    if (tenantSlug && onlyDept?.slug) redirect(`/${tenantSlug}/${onlyDept.slug}`);
    redirect("/");
  }
  // Zero accessible departments — render the (empty) picker instead of
  // redirecting to "/", which would re-enter the proxy ↔ departments loop.

  // Explicitly bound to the caller's accessible dept ids + tenant; run
  // unscoped to skip the per-query scope waterfall.
  const rawDepts = await runAsSystem(() =>
    prisma.department.findMany({
      where: { id: { in: allIds }, tenantId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { subDepartments: true, projects: true, managers: true } },
        subDepartments: {
          select: {
            _count: { select: { memberships: { where: { isActive: true } } } },
          },
        },
      },
    }),
  );

  const myDepts: MyDepartmentItem[] = rawDepts.map((d) => ({
    id: d.id,
    name: d.name,
    isHub: d.isHub,
    subDepartmentCount: d._count.subDepartments,
    projectCount: d._count.projects,
    managerCount: d._count.managers,
    memberCount: d.subDepartments.reduce((sum, t) => sum + t._count.memberships, 0),
    accessType: managedIds.includes(d.id)
      ? "manager"
      : grantedIds.includes(d.id)
        ? "guest"
        : "member",
  }));

  return <MyDepartmentsClient departments={myDepts} />;
}
