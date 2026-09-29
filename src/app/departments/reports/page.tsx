import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { SubDepartmentTimePage } from "@/components/time/sub-department-time-page";

export const metadata = { title: "Reports — Departments — Global Support Portal" };

export default async function DepartmentsReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isTenantAdmin =
    profile.activeTenantId != null &&
    (profile.tenantMemberships ?? []).some(
      (m) => m.tenantId === profile.activeTenantId && m.role === "admin",
    );
  if (!profile.isSuperAdmin && profile.role !== "admin" && !isTenantAdmin) {
    redirect("/departments");
  }

  return <SubDepartmentTimePage showDepartmentFilter />;
}
