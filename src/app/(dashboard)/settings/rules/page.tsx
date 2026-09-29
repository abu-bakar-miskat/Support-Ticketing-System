import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, canAdminDeptSettings } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { RulesSettingsPage } from "@/components/settings/rules-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "Automation rules — Global Support Portal" };

export default async function SettingsRulesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  if (!isAdmin) redirect("/settings");

  // Resolve which department these rules belong to: the active department when
  // one is entered, otherwise the first the admin can manage.
  const deptScope = await getProfileDeptScope(profile);
  let departmentId = deptScope?.activeDeptId ?? null;

  if (!departmentId) {
    const tenantId = profile.activeTenantId ?? "__no_tenant__";
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
  if (!canAdminDeptSettings(profile, department.id)) redirect("/settings");

  const people = await runAsSystem(() => fetchProjectDepartmentPeople(department.id));
  const members = people.map((p) => ({
    id: p.id,
    name: p.name,
    subDepartmentName: p.subDepartmentName,
  }));

  return (
    <RulesSettingsPage
      departmentId={department.id}
      departmentName={department.name}
      members={members}
      subDepartments={department.subDepartments}
    />
  );
}
