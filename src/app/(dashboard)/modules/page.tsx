import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { buildProjectDeptWhere, getProfileDeptScope } from "@/lib/dept-scope";
import { canAccessModulesArea, canManageModules } from "@/lib/module-permissions";
import { ModulesPage } from "@/components/modules/modules-page";

export const metadata = { title: "Modules — Ticketing System" };

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const deptScope = await getProfileDeptScope(profile);
  if (!canAccessModulesArea(profile, deptScope?.activeDeptId ?? null)) {
    redirect("/");
  }

  const scopeWhere = deptScope
    ? deptScope.isCrossAccessOnly
      ? {
          members: { some: { userId: profile.id } },
          OR: [
            { departmentId: deptScope.activeDeptId },
            { team: { departmentId: deptScope.activeDeptId } },
          ],
        }
      : buildProjectDeptWhere(deptScope)
    : profile.role === "admin"
      ? { tenantId: profile.activeTenantId ?? "__no_tenant__" }
      : { members: { some: { userId: profile.id } } };

  // All in-scope projects (modules-off included) so create dialog can pick any
  // and auto-enable the module system. Don't await — chrome paints first.
  const projectsPromise = prisma.project
    .findMany({
      where: { AND: [scopeWhere] },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        avatarUrl: true,
        moduleSystemEnabled: true,
        department: { select: { id: true, name: true } },
        team: { select: { department: { select: { id: true, name: true } } } },
      },
    })
    .then((rows) =>
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color,
        avatarUrl: p.avatarUrl,
        moduleSystemEnabled: p.moduleSystemEnabled,
        department: p.department ?? p.team?.department ?? null,
      })),
    );

  return (
    <ModulesPage projectsPromise={projectsPromise} canManage={canManageModules(profile)} />
  );
}
