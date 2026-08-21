import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { avatarColorFor } from "@/lib/board-data";
import {
  SettingsSubDepartmentsPage,
  type SubDepartmentRow,
  type PendingRequest,
} from "@/components/settings/settings-sub-departments-page";

export const metadata = { title: "Sub Departments — Support Ticketing System" };

export default async function SubDepartmentsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  const deptScope = await getProfileDeptScope(profile);
  const activeDeptId = deptScope?.activeDeptId ?? null;
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  const deptScopeList = activeDeptId
    ? [activeDeptId]
    : isManager
      ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
      : null;

  // Fetch department managers so we can display them as team leads when
  // no explicit TeamMembership with role="sub_manager" exists.
  const deptManagerMap = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  if (deptScopeList?.length) {
    const deptManagers = await prisma.departmentManager.findMany({
      where: { departmentId: { in: deptScopeList } },
      select: { departmentId: true, user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { assignedAt: "asc" },
    });
    for (const dm of deptManagers) {
      if (!deptManagerMap.has(dm.departmentId)) {
        deptManagerMap.set(dm.departmentId, { id: dm.user.id, name: dm.user.name, avatarUrl: dm.user.avatarUrl ?? null });
      }
    }
  }

  const [subDepartmentsRaw, departments, joinRequests] = await Promise.all([
    prisma.subDepartment.findMany({
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
      include: { subDepartments: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.joinRequest.findMany({
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
            subDepartments: { orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const subDepartmentRows: SubDepartmentRow[] = subDepartmentsRaw.map((subDepartment) => {
    const explicitLeads = subDepartment.memberships
      .filter((m) => m.role === "sub_manager")
      .map((m) => ({ userId: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl ?? null, isExplicit: true as const }));

    const subDepartmentManagerMember = subDepartment.memberships.find((m) => m.role === "manager" || m.role === "admin");
    const deptManager = deptManagerMap.get(subDepartment.department.id);

    const fallbackLead =
      subDepartmentManagerMember?.user ??
      (deptManager ? { id: deptManager.id, name: deptManager.name, avatarUrl: deptManager.avatarUrl } : null) ??
      subDepartment.memberships[0]?.user ??
      null;

    const leads =
      explicitLeads.length > 0
        ? explicitLeads
        : fallbackLead
          ? [{ userId: fallbackLead.id, name: fallbackLead.name, avatarUrl: fallbackLead.avatarUrl ?? null, isExplicit: false as const }]
          : [];

    const leadIds = new Set(
      subDepartment.memberships.filter((m) => m.role === "sub_manager").map((m) => m.user.id),
    );
    const nonLeadMembers = subDepartment.memberships.filter((m) => !leadIds.has(m.user.id));

    return {
      id: subDepartment.id,
      name: subDepartment.name,
      prefix: subDepartment.prefix,
      departmentId: subDepartment.department.id,
      color: subDepartment.color ?? avatarColorFor(subDepartment.name),
      leads,
      memberColors: nonLeadMembers.slice(0, 3).map((m) => avatarColorFor(m.user.name)),
      members: nonLeadMembers.slice(0, 3).map((m) => ({
        name: m.user.name,
        avatarUrl: m.user.avatarUrl ?? null,
      })),
      extraMembers: Math.max(0, nonLeadMembers.length - 3),
      department: subDepartment.department.name,
    };
  });

  const pendingRequests: PendingRequest[] = joinRequests
    .filter((r) => r.department)
    .map((r) => ({
      id: r.id,
      departmentId: r.department!.id,
      departmentName: r.department!.name,
      subDepartments: r.department!.subDepartments,
      userId: r.user.id,
      userName: r.user.name,
      userEmail: r.user.email,
      userColor: avatarColorFor(r.user.name),
      userAvatarUrl: r.user.avatarUrl ?? null,
      requestedAt: r.requestedAt.toISOString(),
    }));

  return (
    <SettingsSubDepartmentsPage
      subDepartments={subDepartmentRows}
      departments={departments}
      isAdmin={isAdmin}
      isManager={isManager}
      pendingRequests={pendingRequests}
    />
  );
}
