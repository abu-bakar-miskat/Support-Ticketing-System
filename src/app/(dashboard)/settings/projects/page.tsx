import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SettingsProjectsPage,
} from "@/components/settings/settings-projects-page";
import { type ProjectRow } from "@/components/projects/project-modal";
import { canDeleteProjects } from "@/lib/project-permissions";
import { avatarColorFor } from "@/lib/avatar";

export const metadata = { title: "Projects — Support Ticketing System" };

export default async function SettingsProjectsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  if (!isAdmin && !isManager && profile.role !== "sub_manager") redirect("/settings");

  // Profile-aware scope — validates cookie, auto-derives for managers
  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;

  if (checkIsCrossAccessDept(profile, activeDeptId)) redirect("/projects");

  const deptScopeList = activeDeptId ? [activeDeptId] : null;
  const tenantId = profile.activeTenantId ?? "__no_tenant__";

  // Resolve team IDs within the scoped dept
  const scopedSubDepartmentIds = profileScope?.subDepartmentIds ?? null;

  const [projects, departments] = await Promise.all([
    prisma.project.findMany({
      where: isAdmin
        ? activeDeptId && scopedSubDepartmentIds
          ? { OR: [{ departmentId: activeDeptId }, { subDepartmentId: { in: scopedSubDepartmentIds } }] }
          : { tenantId }
        : profileScope
          ? { OR: [{ departmentId: activeDeptId }, { subDepartmentId: { in: scopedSubDepartmentIds! } }] }
          : { members: { some: { userId: profile.id } } },
      orderBy: { name: "asc" },
      include: {
        department: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
        _count: {
          select: {
            tickets: { where: { deletedAt: null, status: { not: "Live" } } },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: isAdmin ? { tenantId } : deptScopeList?.length ? { id: { in: deptScopeList } } : { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Auto-assign the active department (matching the sidebar create flow); admins
  // in global view (no active department) keep the full department picker.
  const lockedDepartment = activeDeptId
    ? (departments.find((d) => d.id === activeDeptId) ?? null)
    : null;

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color ?? "#0a76b9",
    avatarUrl: p.avatarUrl ?? null,
    description: p.description ?? null,
    projectStatus: p.projectStatus ?? "pipeline",
    moduleSystemEnabled: p.moduleSystemEnabled,
    liveDomain: p.projectUrl ?? null,
    prefix: `${p.slug.split("-")[0].toUpperCase()}-`,
    openCount: p._count.tickets,
    departmentId: p.department?.id ?? null,
    departmentName: p.department?.name ?? null,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarColor: avatarColorFor(m.user.name),
      avatarUrl: m.user.avatarUrl ?? null,
    })),
  }));

  return (
    <SettingsProjectsPage
      projects={rows}
      departments={departments}
      lockedDepartment={lockedDepartment}
      isAdmin={isAdmin}
      canDeleteProjects={canDeleteProjects(profile)}
    />
  );
}
