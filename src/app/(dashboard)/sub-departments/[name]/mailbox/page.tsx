import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { SubDepartmentMailboxManager } from "@/components/sub-departments/sub-department-mailbox";

export const metadata = { title: "Mailbox — Global Support Portal" };

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const { name } = await params;
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile);
  if (!subDepartment) notFound();

  const canManage = profile.role === "admin" || profile.role === "manager";

  return (
    <SubDepartmentMailboxManager
      subDepartmentId={subDepartment.id}
      subDepartmentName={subDepartment.name}
      prefix={subDepartment.prefix}
      assignmentMethod={subDepartment.assignmentMethod}
      canManage={canManage}
    />
  );
}
