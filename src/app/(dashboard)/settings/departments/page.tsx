import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { listCatalogueForTenant } from "@/lib/template-catalogue";
import { departmentTypeForTemplateSlug } from "@/lib/system-templates";
import { SettingsDepartmentsPage, type DepartmentRow, type TemplateOption } from "@/components/settings/settings-departments-page";

export const metadata = { title: "Departments — Support Ticketing System" };

export default async function SettingsDepartmentsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  // Admins see all departments; managers see only their own
  if (!isAdmin && !isManager) redirect("/settings");

  // Profile-aware scope — validates cookie, auto-derives for managers
  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  // Managers only see departments they directly manage — cross-access grants do
  // not entitle them to view or modify department settings.
  const managedDeptIds = profile.managedDepartmentIds ?? [];

  // Everything here is bounded to the active tenant.
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  const deptWhere = activeDeptId
    ? { id: activeDeptId }                          // scoped to active dept
    : isAdmin
      ? { tenantId }                                 // admin: all depts in this tenant
      : { id: { in: managedDeptIds } };             // manager: their own depts only

  // deptWhere is bound to the caller's managed dept ids / tenant — run
  // unscoped to skip the per-query scope waterfall.
  const [departments, users] = await runAsSystem(() => Promise.all([
    prisma.department.findMany({
      where: deptWhere,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { subDepartments: true } },
        subDepartments: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
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
            user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
            grantor: { select: { id: true, name: true } },
          },
          orderBy: { grantedAt: "desc" },
        },
      },
    }),
    prisma.profile.findMany({
      where: { tenantMemberships: { some: { tenantId, isActive: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    }),
  ]));

  // Fetch subDepartment memberships with user details for each department
  const deptIds = departments.map((d) => d.id);
  const memberships = deptIds.length > 0
    ? await prisma.subDepartmentMembership.findMany({
        where: { isActive: true, subDepartment: { departmentId: { in: deptIds } } },
        select: {
          userId: true,
          role: true,
          subDepartment: { select: { id: true, name: true, departmentId: true } },
          user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        },
      })
    : [];

  // Group members by department, then by sub-department
  const membersByDept = new Map<string, Map<string, { role: string; user: { id: string; name: string; email: string; role: string; avatarUrl: string | null } }>>();
  const byDeptSub = new Map<string, Map<string, { name: string; members: Map<string, { role: string; user: { id: string; name: string; email: string; role: string; avatarUrl: string | null } }> }>>();
  for (const m of memberships) {
    const dId = m.subDepartment.departmentId;
    const map = membersByDept.get(dId) ?? new Map();
    map.set(m.userId, { role: m.role, user: { ...m.user, avatarUrl: m.user.avatarUrl ?? null } });
    membersByDept.set(dId, map);

    const subMap = byDeptSub.get(dId) ?? new Map();
    const group = subMap.get(m.subDepartment.id) ?? {
      name: m.subDepartment.name,
      members: new Map(),
    };
    group.members.set(m.userId, { role: m.role, user: { ...m.user, avatarUrl: m.user.avatarUrl ?? null } });
    subMap.set(m.subDepartment.id, group);
    byDeptSub.set(dId, subMap);
  }

  const rows: DepartmentRow[] = departments.map((d) => {
    const nativeMemberMap = membersByDept.get(d.id) ?? new Map();
    const totalMembers = nativeMemberMap.size;
    const subGroups = byDeptSub.get(d.id) ?? new Map();
    // Include every sub-department (even empty) so the card shows the full breakdown.
    const membersBySubDepartment = d.subDepartments.map((sub) => {
      const group = subGroups.get(sub.id);
      return {
        subDepartmentId: sub.id,
        subDepartmentName: sub.name,
        members: group
          ? [...group.members.entries()].map(([uid, m]) => ({ userId: uid, role: m.role, user: m.user }))
          : [],
      };
    });
    return {
      id: d.id,
      name: d.name,
      isHub: d.isHub,
      type: d.type,
      setupCompletedAt: d.setupCompletedAt ? d.setupCompletedAt.toISOString() : null,
      _count: { ...d._count, members: totalMembers },
      managers: d.managers.map((m) => ({
        id: m.id,
        userId: m.userId,
        user: { id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, avatarUrl: m.user.avatarUrl ?? null },
      })),
      accessGrants: d.accessGrants.map((g) => ({
        id: g.id,
        userId: g.userId,
        expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
        reason: g.reason,
        grantedAt: g.grantedAt.toISOString(),
        fullAccess: g.fullAccess,
        user: { id: g.user.id, name: g.user.name, email: g.user.email, role: g.user.role, avatarUrl: g.user.avatarUrl ?? null },
        grantor: { id: g.grantor.id, name: g.grantor.name },
      })),
      directMembers: [],
      nativeMembers: [...nativeMemberMap.entries()].map(([uid, m]) => ({
        userId: uid,
        role: m.role,
        user: m.user,
      })),
      membersBySubDepartment,
      memberIds: [...nativeMemberMap.keys()],
      subDepartments: d.subDepartments,
    };
  });

  const allUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
  }));

  // Templates available to this tenant, so the New Department modal can offer
  // them dynamically instead of the hardcoded department-type list.
  const catalogue = await listCatalogueForTenant(tenantId);
  const templateOptions: TemplateOption[] = catalogue.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    featureCount: t.features.length,
    status: t.status,
    departmentType: departmentTypeForTemplateSlug(t.slug),
  }));

  return (
    <SettingsDepartmentsPage
      departments={rows}
      allUsers={allUsers}
      isAdmin={isAdmin}
      inWorkspace={!!activeDeptId}
      templateOptions={templateOptions}
    />
  );
}
