import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { AssignmentSettingsPage } from "@/components/settings/assignment-settings-page";

export const metadata = { title: "Assignment methods — Support Ticketing System" };

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

  // The method set here overrides the parent department's for this
  // sub-department's tickets; leaving it on "Inherit" defers to the parent
  // (see lib/assignment-engine.ts).
  return (
    <AssignmentSettingsPage
      departmentId={subDepartment.departmentId}
      departmentName={subDepartment.departmentName}
      subDepartmentId={subDepartment.id}
      subDepartmentName={subDepartment.name}
      backHref="/sub-departments"
      backLabel="Sub-departments"
    />
  );
}
