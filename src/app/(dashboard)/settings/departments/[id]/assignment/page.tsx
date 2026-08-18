import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canManageDeptCalendar } from "@/lib/dept-scope";
import { AssignmentSettingsPage } from "@/components/settings/assignment-settings-page";

export const metadata = { title: "Assignment methods — Ticketing System" };

export default async function DepartmentAssignmentSettingsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { id: departmentId } = await params;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!department) notFound();

  const canManage = canManageDeptCalendar(profile, departmentId);
  if (!canManage) redirect("/settings/departments");

  return (
    <AssignmentSettingsPage
      departmentId={department.id}
      departmentName={department.name}
    />
  );
}
