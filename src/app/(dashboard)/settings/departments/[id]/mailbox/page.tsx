import { redirect, notFound } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { canManageDeptCalendar } from "@/lib/dept-scope";
import { DepartmentMailboxPage } from "@/components/settings/department-mailbox-page";

export const metadata = { title: "Mailbox — Support Ticketing System" };

export default async function DepartmentMailboxRoute({
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
    <DepartmentMailboxPage
      departmentId={department.id}
      departmentName={department.name}
    />
  );
}
