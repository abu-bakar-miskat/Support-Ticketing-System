import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { RulesSettingsPage } from "@/components/settings/rules-settings-page";

export const metadata = { title: "Automation rules — Support Ticketing System" };

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

  // Rules created here are scoped to this sub-department (they run in addition
  // to the parent department's rules on this sub-department's tickets).
  return (
    <RulesSettingsPage
      departmentId={subDepartment.departmentId}
      departmentName={subDepartment.departmentName}
      subDepartmentId={subDepartment.id}
      subDepartmentName={subDepartment.name}
    />
  );
}
