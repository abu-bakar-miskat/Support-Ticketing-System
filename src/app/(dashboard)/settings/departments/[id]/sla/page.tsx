import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canAdminDeptSettings } from "@/lib/dept-scope";
import { SlaSettingsPage } from "@/components/settings/sla-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "SLA policies — Support Ticketing System" };

export default async function DepartmentSlaSettingsRoute({
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

  return (
    <SlaSettingsPage
      departmentId={department.id}
      departmentName={department.name}
      subDepartments={department.subDepartments}
    />
  );
}
