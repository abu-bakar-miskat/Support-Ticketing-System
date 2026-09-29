import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canManageDeptCalendar } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { AssignmentSettingsPage } from "@/components/settings/assignment-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "Assignment methods — Global Support Portal" };

export default async function DepartmentAssignmentSettingsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { id: departmentId } = await params;

  const department = await runAsSystem(() => prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  }));
  if (!department) notFound();

  const canManage = canManageDeptCalendar(profile, departmentId);
  if (!canManage) redirect("/settings/departments");

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
