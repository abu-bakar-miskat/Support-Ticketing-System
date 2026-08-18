import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { SettingsWorkflowsPage } from "@/components/settings/settings-workflows-page";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";

export const metadata = { title: "Workflows & statuses — Ticketing System" };

export default async function SettingsWorkflowsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isLead = profile.role === "lead";

  if (!isAdmin && !isManager && !isLead) redirect("/settings");

  const deptScope = await getProfileDeptScope(profile);

  if (checkIsCrossAccessDept(profile, deptScope?.activeDeptId ?? null)) redirect("/projects");

  // Build the team filter scoped to the user's access level
  const allowedDeptIds = isManager
    ? [...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])]
    : [];
  const leadSubDepartmentIds = isLead
    ? (profile.subDepartmentIds?.length ? profile.subDepartmentIds : profile.subDepartmentId ? [profile.subDepartmentId] : [])
    : [];

  const activeDeptId = deptScope?.activeDeptId ?? null;

  const subDepartmentWhere = isAdmin
    ? activeDeptId ? { departmentId: activeDeptId } : { tenantId: profile.activeTenantId ?? "__no_tenant__" }   // admin: active dept, else whole tenant
    : isManager
      ? deptScope?.subDepartmentIds?.length
        ? { id: { in: deptScope.subDepartmentIds } }
        : allowedDeptIds.length
          ? { departmentId: { in: allowedDeptIds } }
          : { id: { in: [] as string[] } }
      : { id: { in: leadSubDepartmentIds.length ? leadSubDepartmentIds : [] as string[] } };

  const subDepartments = await prisma.subDepartment.findMany({
    where: subDepartmentWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, prefix: true },
  });

  const defaultSubDepartmentId = subDepartments[0]?.id ?? null;

  const initialStatuses = defaultSubDepartmentId
    ? await prisma.subDepartmentStatus.findMany({
        where: { subDepartmentId: defaultSubDepartmentId },
        orderBy: { order: "asc" },
        select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
      })
    : [];

  return (
    <SettingsWorkflowsPage
      subDepartments={subDepartments}
      defaultSubDepartmentId={defaultSubDepartmentId}
      initialStatuses={initialStatuses}
    />
  );
}
