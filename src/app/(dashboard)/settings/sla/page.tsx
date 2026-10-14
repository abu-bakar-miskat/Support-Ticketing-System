import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, canAdminDeptSettings } from "@/lib/dept-scope";
import { SlaSettingsPage } from "@/components/settings/sla-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "SLA policies — Global Support Portal" };

export default async function SettingsSlaRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";

  const deptScope = await getProfileDeptScope(profile);
  let departmentId = deptScope?.activeDeptId ?? null;

  if (!departmentId) {
    const tenantId = profile.activeTenantId ?? "__no_tenant__";
    // Managers reach this page for the shared-mailbox SLA (department admins
    // are a subset of managed departments).
    const where = isAdmin
      ? { tenantId }
      : { id: { in: profile.managedDepartmentIds ?? [] } };
    const first = await runAsSystem(() => prisma.department.findFirst({
      where,
      orderBy: { name: "asc" },
      select: { id: true },
    }));
    departmentId = first?.id ?? null;
  }

  if (!departmentId) redirect("/settings/departments");

  const department = await runAsSystem(() => prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  }));
  if (!department) redirect("/settings/departments");
  const canEditPolicies = canAdminDeptSettings(profile, department.id);
  const isDeptManager = (profile.managedDepartmentIds ?? []).includes(department.id);
  if (!canEditPolicies && !isDeptManager) redirect("/settings");

  return (
    <SlaSettingsPage
      departmentId={department.id}
      departmentName={department.name}
      subDepartments={department.subDepartments}
      canEditPolicies={canEditPolicies}
    />
  );
}
