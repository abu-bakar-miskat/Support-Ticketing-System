import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canManageDeptCalendar } from "@/lib/dept-scope";
import { RulesSettingsPage } from "@/components/settings/rules-settings-page";

export const metadata = { title: "Automation rules — Support Ticketing System" };

export default async function DepartmentRulesSettingsRoute({
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

  if (!canManageDeptCalendar(profile, departmentId)) redirect("/settings/departments");

  return <RulesSettingsPage departmentId={department.id} departmentName={department.name} />;
}
