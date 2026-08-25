import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, canManageDeptCalendar } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { AssignmentSettingsPage } from "@/components/settings/assignment-settings-page";

export const metadata = { title: "Assignment methods — Support Ticketing System" };

export default async function SettingsAssignmentRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  if (!isAdmin && !isManager) redirect("/settings");

  // Resolve which department these settings belong to: the active department
  // when one is entered, otherwise the first the admin/manager can manage.
  const deptScope = await getProfileDeptScope(profile);
  let departmentId = deptScope?.activeDeptId ?? null;

  if (!departmentId) {
    const tenantId = profile.activeTenantId ?? "__no_tenant__";
    const where = isAdmin
      ? { tenantId }
      : { id: { in: profile.managedDepartmentIds ?? [] } };
    const first = await prisma.department.findFirst({
      where,
      orderBy: { name: "asc" },
      select: { id: true },
    });
    departmentId = first?.id ?? null;
  }

  if (!departmentId) redirect("/settings/departments");

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!department) redirect("/settings/departments");
  if (!canManageDeptCalendar(profile, department.id)) redirect("/settings");

  // Members feed the per-form rule-based "assign to" picker when a sub-department
  // is selected from the scope dropdown.
  const people = await fetchProjectDepartmentPeople(department.id);
  const members = people.map((p) => ({
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    departmentName: p.departmentName,
    subDepartmentName: p.subDepartmentName,
  }));

  return (
    <AssignmentSettingsPage
      departmentId={department.id}
      departmentName={department.name}
      subDepartments={department.subDepartments}
      members={members}
    />
  );
}
