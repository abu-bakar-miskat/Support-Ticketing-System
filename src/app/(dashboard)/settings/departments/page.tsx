import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { SettingsDepartmentsPage, type DepartmentRow } from "@/components/settings/settings-departments-page";

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

  const [departments, users] = await Promise.all([
    prisma.department.findMany({
      where: deptWhere,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { subDepartments: true } },
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
        directMembers: {
          include: { user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } } },
          orderBy: { addedAt: "asc" },
        },
      },
    }),
    prisma.profile.findMany({
      where: { tenantMemberships: { some: { tenantId, isActive: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
    }),
  ]);

  // Fetch team memberships with user details for each department
  const deptIds = departments.map((d) => d.id);
  const memberships = deptIds.length > 0
    ? await prisma.subDepartmentMembership.findMany({
        where: { isActive: true, subDepartment: { departmentId: { in: deptIds } } },
        select: {
          userId: true,
          subDepartment: { select: { departmentId: true } },
          user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        },
      })
    : [];

  // Group member data by department
  const membersByDept = new Map<string, Map<string, { id: string; name: string; email: string; role: string; avatarUrl: string | null }>>();
  for (const m of memberships) {
    const dId = m.subDepartment.departmentId;
    const map = membersByDept.get(dId) ?? new Map();
    map.set(m.userId, { ...m.user, avatarUrl: m.user.avatarUrl ?? null });
    membersByDept.set(dId, map);
  }

  const rows: DepartmentRow[] = departments.map((d) => {
    const nativeMemberMap = membersByDept.get(d.id) ?? new Map();
    const totalMembers = new Set([
      ...nativeMemberMap.keys(),
      ...d.directMembers.map((m) => m.userId),
    ]).size;
    return {
      id: d.id,
      name: d.name,
      isHub: d.isHub,
      type: d.type,
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
      directMembers: d.directMembers.map((m) => ({
        id: m.id,
        userId: m.userId,
        user: { id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, avatarUrl: m.user.avatarUrl ?? null },
      })),
      nativeMembers: [...nativeMemberMap.entries()].map(([uid, u]) => ({
        userId: uid,
        user: u,
      })),
      memberIds: [...nativeMemberMap.keys()],
    };
  });

  const allUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
  }));

  return (
    <SettingsDepartmentsPage
      departments={rows}
      allUsers={allUsers}
      isAdmin={isAdmin}
      inWorkspace={!!activeDeptId}
    />
  );
}
