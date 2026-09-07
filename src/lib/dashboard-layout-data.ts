import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db";
import { buildProjectDeptWhere, getProfileDeptScope } from "@/lib/dept-scope";
import { getDashboardBadgesData } from "@/lib/dashboard-badges-data";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { canAccessModulesArea } from "@/lib/module-permissions";
import { dedupeMiscProjects } from "@/lib/misc-project";
import {
  dedupeSupportProjects,
  includeDeptProjectsForNativeMembers,
  isNativeDeptMemberOrManager,
} from "@/lib/support-project";
import type { LayoutData } from "@/components/dashboard/dashboard-layout";
import type { AuthProfile } from "@/lib/auth";
import type { ProfileMembership } from "@/lib/profile";
import { parsePinnedProjectIds } from "@/lib/pinned-projects-prefs";
import { getTenantActiveFeatureKeys, getDepartmentActiveFeatureKeys } from "@/lib/template-catalogue";
import { listFeatureFlags } from "@/lib/feature-flags";

const projectSelect = {
  id: true,
  name: true,
  slug: true,
  kind: true,
  color: true,
  avatarUrl: true,
  subDepartmentId: true,
  departmentId: true,
  projectStatus: true,
  _count: {
    select: {
      tickets: { where: { deletedAt: null } },
    },
  },
  subDepartment: { select: { department: { select: { id: true, name: true } } } },
  department: { select: { id: true, name: true } },
} as const;

export const getDashboardLayoutData = cache(async function getDashboardLayoutData(
  profile: AuthProfile,
  deferBadges = false,
): Promise<LayoutData> {
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isDeptLevel = isAdmin || isManager;
  const memberships = (profile.memberships ?? []) as ProfileMembership[];

  const managedDeptIds: string[] = profile.managedDepartmentIds ?? [];
  const grantedDeptIds: string[] = profile.grantedAccessDeptIds ?? [];

  const membershipSubDepartments = memberships.map((m) => ({
    id: m.subDepartment.id,
    name: m.subDepartment.name,
    prefix: m.subDepartment.prefix,
    departmentId: m.subDepartment.department?.id ?? null,
    departmentName: m.subDepartment.department?.name ?? null,
  }));

  const membershipDeptIds = membershipSubDepartments
    .map((t) => t.departmentId)
    .filter((id): id is string => Boolean(id));

  const allowedDeptIds = isAdmin
    ? null
    : isManager
      ? [...new Set([...managedDeptIds, ...grantedDeptIds, ...membershipDeptIds])]
      : null;

  // Primary dept for staff/lead (first subDepartment's department)
  const primaryDeptId = membershipSubDepartments[0]?.departmentId ?? null;
  // Staff/lead with access to more than one department — via multiple subDepartment
  // memberships or a DepartmentAccess grant (cross-access).
  const crossDeptIds = !isDeptLevel
    ? [
        ...new Set([
          ...(primaryDeptId ? [primaryDeptId] : []),
          ...membershipDeptIds,
          ...grantedDeptIds,
        ]),
      ]
    : [];

  const deptScope = await getProfileDeptScope(profile);
  const activeDeptId = deptScope?.activeDeptId ?? null;

  // True only when the user is a manager AND manages the currently active department.
  // A manager visiting a dept they're a member of (not managing) should get the member experience.
  const isManagerOfActiveDept =
    isManager && activeDeptId !== null && managedDeptIds.includes(activeDeptId);

  const [allDeptsRaw, deptSubDepartmentsRaw] = await Promise.all([
    isDeptLevel
      ? prisma.department.findMany({
          where: isAdmin
            ? { tenantId: profile.activeTenantId ?? "__no_tenant__" }
            : { id: { in: allowedDeptIds ?? [] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : !isDeptLevel && crossDeptIds.length > 0
        ? prisma.department.findMany({
            where: { id: { in: crossDeptIds } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    isDeptLevel
      ? prisma.subDepartment.findMany({
          where: deptScope
            ? { departmentId: deptScope.activeDeptId }
            : isAdmin
              ? {}
              : { departmentId: { in: allowedDeptIds ?? [] } },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            prefix: true,
            departmentId: true,
            department: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // For staff with cross-dept access, put their home department first
  let allDepts =
    !isDeptLevel && primaryDeptId
      ? [
          ...allDeptsRaw.filter((d) => d.id === primaryDeptId),
          ...allDeptsRaw.filter((d) => d.id !== primaryDeptId),
        ]
      : allDeptsRaw;

  if (
    activeDeptId &&
    !allDepts.some((d) => d.id === activeDeptId)
  ) {
    const activeDept = await prisma.department.findUnique({
      where: { id: activeDeptId },
      select: { id: true, name: true },
    });
    if (activeDept) allDepts = [activeDept, ...allDepts];
  }

  // The active department's template type — drives per-type nav in the sidebar.
  const activeDeptType = activeDeptId
    ? (
        await prisma.department.findUnique({
          where: { id: activeDeptId },
          select: { type: true },
        })
      )?.type ?? null
    : null;

  const crossAccessDeptIds = allDepts
    .filter((d) => checkIsCrossAccessDept(profile, d.id))
    .map((d) => d.id);

  const subDepartments =
    deptSubDepartmentsRaw.length > 0
      ? deptSubDepartmentsRaw.map((t) => ({
          id: t.id,
          name: t.name,
          prefix: t.prefix,
          departmentId: t.departmentId ?? null,
          departmentName: t.department?.name ?? null,
        }))
      : membershipSubDepartments;

  const visibleSubDepartmentIds = isDeptLevel
    ? subDepartments.map((t) => t.id)
    : membershipSubDepartments.map((t) => t.id);

  // Hub department: show only projects the user (or their dept members) are assigned to
  const isHubDept = deptScope?.isHub === true;
  // Cross-access: user is visiting a dept they were granted access to, not a native member.
  // This still applies (guest badge, restricted nav) even with a full-access grant — full
  // access only changes which projects are visible, not the guest-level experience.
  const isCrossAccessDept = checkIsCrossAccessDept(profile, activeDeptId);
  const crossDeptMemberWhere = { members: { some: { userId: profile.id } } };
  // Full-access grants are excluded from isCrossAccessOnly, so a full-access guest still
  // falls through to normal dept-scoped project visibility instead of just their own.
  const restrictProjectsToOwn = isCrossAccessDept && deptScope?.isCrossAccessOnly === true;
  const projectWhereBase = isHubDept
    ? isManagerOfActiveDept
      ? { subDepartmentId: { in: deptScope!.subDepartmentIds } }
      : activeDeptId && isNativeDeptMemberOrManager(profile, activeDeptId)
        ? buildProjectDeptWhere(deptScope!)
        : crossDeptMemberWhere
    : restrictProjectsToOwn
      // Cross-access users without full access only see projects they're explicitly assigned to
      ? crossDeptMemberWhere
      : deptScope
        ? buildProjectDeptWhere(deptScope)
        : isAdmin
          ? {}
          : isManager && allowedDeptIds
            ? {
                OR: [
                  { subDepartmentId: { in: visibleSubDepartmentIds } },
                  { departmentId: { in: allowedDeptIds } },
                  crossDeptMemberWhere,
                ],
              }
            : { subDepartmentId: { in: visibleSubDepartmentIds } };

  const projectWhere = restrictProjectsToOwn
    ? projectWhereBase
    : includeDeptProjectsForNativeMembers(
        projectWhereBase,
        profile,
        activeDeptId,
      );

  const recentTicketWhere = deptScope?.isCrossAccessOnly && profile.id
    ? {
        deletedAt: null,
        project: {
          members: { some: { userId: profile.id } },
          OR: [
            { departmentId: deptScope.activeDeptId },
            { subDepartment: { departmentId: deptScope.activeDeptId } },
          ],
        },
      }
    : deptScope
      ? { deletedAt: null, subDepartmentId: { in: deptScope.subDepartmentIds } }
      : visibleSubDepartmentIds.length > 0
        ? { deletedAt: null, subDepartmentId: { in: visibleSubDepartmentIds } }
        : { deletedAt: null };

  const [
    projects,
    recentTicketRows,
    assignedRows,
    badges,
    activeFeatureKeySet,
    platformFlags,
  ] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: "asc" },
      select: projectSelect,
    }),
    prisma.ticket.findMany({
      where: recentTicketWhere,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        ticketNumber: true,
        status: true,
        subDepartment: { select: { prefix: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { userId: profile.id },
      select: { projectId: true },
    }),
    deferBadges
      ? Promise.resolve({ myTasksCount: 0, mentionsCount: 0, inboxCount: 0 })
      : getDashboardBadgesData(profile),
    // Inside a department, gate the sidebar by that department's template
    // features; otherwise fall back to the tenant's active templates.
    activeDeptId
      ? getDepartmentActiveFeatureKeys(activeDeptId)
      : profile.activeTenantId
        ? getTenantActiveFeatureKeys(profile.activeTenantId)
        : Promise.resolve("ALL" as const),
    profile.activeTenantId
      ? listFeatureFlags(profile.activeTenantId)
      : Promise.resolve({} as Record<string, boolean>),
  ] as const);

  const dedupedProjects = dedupeSupportProjects(dedupeMiscProjects(projects));

  const miscProjectIdRedirect = new Map<string, string>();
  for (const project of projects) {
    if (project.name !== "Miscellaneous" || !project.subDepartmentId) continue;
    const canonical = dedupedProjects.find(
      (row) => row.name === "Miscellaneous" && row.subDepartmentId === project.subDepartmentId,
    );
    if (canonical && canonical.id !== project.id) {
      miscProjectIdRedirect.set(project.id, canonical.id);
    }
  }

  const ticketCounts = new Map<string, number>();
  for (const project of projects) {
    const targetId = miscProjectIdRedirect.get(project.id) ?? project.id;
    ticketCounts.set(targetId, (ticketCounts.get(targetId) ?? 0) + project._count.tickets);
  }

  const pinnedProjectIds = parsePinnedProjectIds(profile.preferences);
  const assignedProjectIds = assignedRows.map((m) => m.projectId);

  const sidebarProjects = dedupedProjects.map((p) => ({
    id: p.id,
    label: p.name,
    href: `/projects/${p.slug}`,
    color: p.color ?? "#0a76b9",
    avatarUrl: p.avatarUrl ?? null,
    count: ticketCounts.get(p.id) ?? 0,
    subDepartmentId: p.subDepartmentId ?? null,
    kind: p.kind,
    projectStatus: p.projectStatus ?? "pipeline",
    departmentId: p.department?.id ?? p.subDepartment?.department?.id ?? null,
    departmentName: p.department?.name ?? p.subDepartment?.department?.name ?? null,
  }));

  const recentTickets = recentTicketRows.map((t) => ({
    dbId: t.id,
    ticketId: `${t.subDepartment.prefix}-${t.ticketNumber}`,
    label: t.title,
    meta: t.status,
  }));

  const projectNames = Object.fromEntries(
    dedupedProjects.flatMap((p) => [
      [p.slug, p.name],
      [p.id, p.name],
    ]),
  );

  const visibleProjects = activeDeptId
    ? isHubDept
      // Hub context: projectWhere already scoped correctly — show everything fetched
      ? sidebarProjects
      // Non-hub context: restrict strictly to the active dept
      : sidebarProjects.filter((p) => p.departmentId === activeDeptId)
    : sidebarProjects;

  const deptProjectMap = new Map<
    string,
    { id: string; name: string; projects: typeof sidebarProjects }
  >();
  for (const p of visibleProjects) {
    if (!p.departmentId) continue;
    if (!deptProjectMap.has(p.departmentId)) {
      deptProjectMap.set(p.departmentId, {
        id: p.departmentId,
        name: p.departmentName ?? "Unknown",
        projects: [],
      });
    }
    deptProjectMap.get(p.departmentId)!.projects.push(p);
  }

  return {
    projects: visibleProjects,
    subDepartments,
    departments: [...deptProjectMap.values()],
    allDepts,
    activeDeptId,
    activeDeptType,
    isCrossAccessDept,
    crossAccessDeptIds,
    // Full-access cross-access guests (grant has fullAccess: true) behave like
    // members for read-only surfaces such as Reports.
    isFullAccessDept: isCrossAccessDept && deptScope?.isCrossAccessOnly !== true,
    isManagerOfActiveDept,
    canAccessModules: canAccessModulesArea(profile, activeDeptId),
    recentTickets,
    projectNames,
    pinnedProjectIds,
    assignedProjectIds,
    ...badges,
    userRole: profile.role,
    isSuperAdmin: profile.isSuperAdmin,
    userId: profile.id,
    activeFeatureKeys: activeFeatureKeySet === "ALL" ? "ALL" : Array.from(activeFeatureKeySet),
    platformFlags,
  };
});
