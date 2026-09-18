import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canAdminDeptSettings } from "@/lib/dept-scope";
import { fetchProjectDepartmentPeople } from "@/lib/project-department-people";
import { RulesSettingsPage } from "@/components/settings/rules-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "Automation rules — Support Ticketing System" };

export default async function DepartmentRulesSettingsRoute({
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

  if (!canAdminDeptSettings(profile, departmentId)) redirect("/settings/departments");

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
