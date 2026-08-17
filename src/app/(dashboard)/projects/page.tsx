import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProjectsPage } from "@/components/projects/projects-page";
import { fetchProjectsList } from "@/lib/projects-list-data";
import { canManageProjects, canManageProjectLifecycle } from "@/lib/project-permissions";
import { parsePinnedProjectIds } from "@/lib/pinned-projects-prefs";
import { ProjectsPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Projects — Ticketing System" };

async function ProjectsData() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const [myProjects, allProjects, profileRow] = await Promise.all([
    fetchProjectsList(profile, "mine"),
    fetchProjectsList(profile, "all"),
    prisma.profile.findUnique({
      where: { id: profile.id },
      select: { preferences: true },
    }),
  ]);

  const pinnedProjectIds = parsePinnedProjectIds(profileRow?.preferences);
  const deptScope = await getProfileDeptScope(profile);
  const isCrossAccess = checkIsCrossAccessDept(profile, deptScope?.activeDeptId ?? null);
  const canManage = canManageProjects(profile) && !isCrossAccess;
  const canEditStatus = canManageProjectLifecycle(profile) && !isCrossAccess;
  let createDepartments: { id: string; name: string }[] = [];
  let lockedDepartment: { id: string; name: string } | null = null;

  if (profile.role === "admin") {
    if (deptScope?.activeDeptId) {
      // Viewing a specific department: auto-assign it, matching the sidebar
      // create flow, so the new project lands in the active department.
      const dept = await prisma.department.findUnique({
        where: { id: deptScope.activeDeptId },
        select: { id: true, name: true },
      });
      if (dept) {
        createDepartments = [dept];
        lockedDepartment = dept;
      }
    } else {
      // Global view (no active department): let the admin pick any department
      // in their tenant.
      createDepartments = await prisma.department.findMany({
        where: { tenantId: profile.activeTenantId ?? "__no_tenant__" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    }
  } else if (deptScope?.activeDeptId) {
    const dept = await prisma.department.findUnique({
      where: { id: deptScope.activeDeptId },
      select: { id: true, name: true },
    });
    if (dept) {
      createDepartments = [dept];
      if (canManage) {
        lockedDepartment = dept;
      }
    }
  }

  return (
    <ProjectsPage
      myProjects={myProjects}
      allProjects={allProjects}
      canCreate={canManage}
      canEdit={canManage}
      canEditStatus={canEditStatus}
      createDepartments={createDepartments}
      lockedDepartment={lockedDepartment}
      pinnedProjectIds={pinnedProjectIds}
      isCrossAccess={isCrossAccess}
    />
  );
}

export default async function ProjectsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<ProjectsPageSkeleton />}>
      <ProjectsData />
    </Suspense>
  );
}
