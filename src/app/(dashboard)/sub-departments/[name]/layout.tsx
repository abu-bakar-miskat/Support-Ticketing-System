import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { getTenantBranding } from "@/lib/tenant-config";
import { SubDepartmentLayout } from "@/components/sub-departments/sub-department-layout";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ name: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const subDepartment = await resolveSubDepartmentByName(decodedName, profile);
  if (!subDepartment) notFound();

  const branding = profile.activeTenantId ? await getTenantBranding(profile.activeTenantId) : null;

  return (
    <SubDepartmentLayout
      name={decodedName}
      title={subDepartment.name}
      subtitle={subDepartment.departmentName}
      navColors={branding?.settingsNavColors}
    >
      {children}
    </SubDepartmentLayout>
  );
}
