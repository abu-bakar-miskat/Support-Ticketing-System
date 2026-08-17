import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectDetailsData } from "@/lib/project-details-data";
import { canManageProjects } from "@/lib/project-permissions";
import { ProjectProfilePage } from "@/components/projects/project-profile-page";
import { ProjectAccessDenied } from "@/components/projects/project-access-denied";
import { ProjectDetailSkeleton } from "@/components/skeletons/page-skeletons";

type Props = { params: Promise<{ id: string }> };

async function ProjectDetailData({ params }: Props) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const initialData = await getProjectDetailsData(profile, id);
  if (!initialData) {
    // Distinguish "doesn't exist" (404) from "exists but no access" (friendly
    // access-denied page) — getProjectDetailsData returns null for both.
    const existing = await prisma.project.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      select: {
        name: true,
        department: { select: { name: true } },
        team: { select: { department: { select: { name: true } } } },
      },
    });
    if (!existing) notFound();
    return (
      <ProjectAccessDenied
        projectName={existing.name}
        deptName={existing.department?.name ?? existing.team?.department?.name ?? null}
      />
    );
  }

  let createDepartments: { id: string; name: string }[] = [];
  let lockedDepartment: { id: string; name: string } | null = null;

  if (initialData.canManageProjectSettings) {
    const deptScope = await getProfileDeptScope(profile);
    const isCrossAccess = checkIsCrossAccessDept(
      profile,
      deptScope?.activeDeptId ?? null,
    );
    const canManage = canManageProjects(profile) && !isCrossAccess;

    if (profile.role === "admin") {
      createDepartments = await prisma.department.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
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
  }

  return (
    <ProjectProfilePage
      projectIdOrSlug={id}
      initialData={initialData}
      createDepartments={createDepartments}
      lockedDepartment={lockedDepartment}
    />
  );
}

export default async function Page({ params }: Props) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<ProjectDetailSkeleton />}>
      <ProjectDetailData params={params} />
    </Suspense>
  );
}
