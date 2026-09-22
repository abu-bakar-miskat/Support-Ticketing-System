import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, canAdminDeptSettings } from "@/lib/dept-scope";
import { SlaSettingsPage } from "@/components/settings/sla-settings-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "SLA policies — Support Ticketing System" };

export default async function SettingsSlaRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";

  const deptScope = await getProfileDeptScope(profile);
  let departmentId = deptScope?.activeDeptId ?? null;

  if (!departmentId) {
    const tenantId = profile.activeTenantId ?? "__no_tenant__";
    const where = isAdmin
      ? { tenantId }
      : { id: { in: profile.departmentAdminIds ?? [] } };
    const first = await runAsSystem(() => prisma.department.findFirst({
      where,
      orderBy: { name: "asc" },
      select: { id: true },
    }));
    departmentId = first?.id ?? null;
  }

  if (!departmentId) redirect("/settings/departments");

  const department = await runAsSystem(() => prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  }));
  if (!department) redirect("/settings/departments");
  if (!canAdminDeptSettings(profile, department.id)) redirect("/settings");

  return (
    <SlaSettingsPage
      departmentId={department.id}
      departmentName={department.name}
      subDepartments={department.subDepartments}
    />
  );
}
