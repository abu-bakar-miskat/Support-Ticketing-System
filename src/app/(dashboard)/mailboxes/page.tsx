import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { DepartmentMailboxesPage } from "@/components/department/department-mailboxes-page";

export const metadata = { title: "Shared Mailboxes — Support Ticketing System" };

export default async function DepartmentMailboxesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isSubManager = profile.role === "sub_manager";
  if (!isAdmin && !isManager && !isSubManager) redirect("/");

  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  if (!activeDeptId) redirect("/departments");

  // activeDeptId comes from the caller's resolved dept scope — run unscoped.
  const dept = await runAsSystem(() =>
    prisma.department.findUnique({
      where: { id: activeDeptId },
      select: {
        id: true,
        name: true,
        subDepartments: {
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  );

  if (!dept) redirect("/departments");

  const membershipIds = new Set(profile.subDepartmentIds ?? []);
  const subDepartments =
    isSubManager
      ? dept.subDepartments.filter((s) => membershipIds.has(s.id))
      : dept.subDepartments;

  return (
    <DepartmentMailboxesPage
      departmentId={dept.id}
      departmentName={dept.name}
      subDepartments={subDepartments}
      canManage={isAdmin || isManager}
    />
  );
}
