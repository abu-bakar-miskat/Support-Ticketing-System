import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { DepartmentsSlaPage } from "@/components/departments/departments-sla-page";

export const metadata = { title: "SLA — Departments — Support Ticketing System" };

export default async function DepartmentsSlaRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const departmentAdminIds = profile.departmentAdminIds ?? [];
  // SLA is an admin-only department setting (canAdminDeptSettings): tenant admins,
  // super-admins, or department-scoped admins. Plain managers are redirected.
  if (!profile.isSuperAdmin && !isAdmin && departmentAdminIds.length === 0) {
    redirect("/departments");
  }

  const tenantId = profile.activeTenantId ?? "__no_tenant__";
  // Tenant/super admins configure every department in the tenant; department
  // admins only the departments they administer.
  const where =
    isAdmin || profile.isSuperAdmin ? { tenantId } : { id: { in: departmentAdminIds } };

  const departments = await prisma.department.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  return <DepartmentsSlaPage departments={departments} />;
}
