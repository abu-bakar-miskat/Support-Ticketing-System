import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { SlaSettingsPage } from "@/components/settings/sla-settings-page";

export const metadata = { title: "SLA policies — Support Ticketing System" };

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

  // Policies and business hours set here are scoped to this sub-department
  // (they apply in addition to the parent department's on its tickets).
  return (
    <SlaSettingsPage
      departmentId={subDepartment.departmentId}
      departmentName={subDepartment.departmentName}
      subDepartmentId={subDepartment.id}
      subDepartmentName={subDepartment.name}
    />
  );
}
