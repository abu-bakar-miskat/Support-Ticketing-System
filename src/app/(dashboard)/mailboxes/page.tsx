import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { DepartmentMailboxesPage } from "@/components/department/department-mailboxes-page";

export const metadata = { title: "Shared Mailboxes — Support Ticketing System" };

export default async function DepartmentMailboxesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  if (!isAdmin && !isManager) redirect("/settings");

  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  if (!activeDeptId) redirect("/departments");

  const dept = await prisma.department.findUnique({
    where: { id: activeDeptId },
    select: {
      id: true,
      name: true,
      subDepartments: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  if (!dept) redirect("/departments");

  return (
    <DepartmentMailboxesPage
      departmentId={dept.id}
      departmentName={dept.name}
      subDepartments={dept.subDepartments}
      canManage={isAdmin || isManager}
    />
  );
}
