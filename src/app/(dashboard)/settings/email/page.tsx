import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { getEmailConfig } from "@/lib/email-config";
import { getTenantConfig } from "@/lib/tenant-config";
import { SettingsEmailPage } from "@/components/settings/settings-email-page";
import { runAsSystem } from "@/lib/request-scope";

export const metadata = { title: "Email settings — Global Support Portal" };

function asConfigObject(
  value: unknown,
): Record<string, string | boolean> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, string | boolean>;
}

export default async function SettingsEmailRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  if (!isAdmin) redirect("/settings");

  const profileScope = await getProfileDeptScope(profile);
  const activeDeptId = profileScope?.activeDeptId ?? null;
  const managedDeptIds = [
    ...new Set([
      ...(profile.managedDepartmentIds ?? []),
      ...(profile.grantedAccessDeptIds ?? []),
    ]),
  ];

  const tenantId = profile.activeTenantId ?? "__no_tenant__";
  const deptWhere = activeDeptId
    ? { id: activeDeptId }
    : isAdmin
      ? { tenantId }
      : { id: { in: managedDeptIds } };

  const [tenant, deptRows, emailConfig] = await Promise.all([
    profile.activeTenantId ? getTenantConfig(profile.activeTenantId) : Promise.resolve(null),
    isAdmin || managedDeptIds.length > 0
      ? runAsSystem(() => prisma.department.findMany({
          where: deptWhere,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            subDepartments: { orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
        }))
      : Promise.resolve([]),
    getEmailConfig(),
  ]);

  // Each department, followed by its sub-departments, so the "Applies to" selector
  // can scope email settings to a specific sub-department (saved as that sub's own
  // override) instead of only the parent department.
  const departments = deptRows.flatMap((d) => [
    { id: d.id, name: d.name },
    ...d.subDepartments.map((s) => ({
      id: d.id,
      name: `${d.name} › ${s.name}`,
      subDepartmentId: s.id,
    })),
  ]);
  const initialConfig = asConfigObject(tenant?.emailConfig);

  return (
    <SettingsEmailPage
      initialConfig={initialConfig}
      isAdmin={isAdmin}
      isManager={isManager}
      departments={departments}
      branding={{
        brandColor: emailConfig.brandColor,
        headerColor: emailConfig.headerColor,
        logoUrl: emailConfig.logoUrl,
        footerText: emailConfig.footerText,
        bodyTextColor: emailConfig.bodyTextColor,
        linkColor: emailConfig.linkColor,
        headerTitle: emailConfig.headerTitle,
        useLogo: emailConfig.useLogo,
        pageBackground: emailConfig.pageBackground,
        hideFooter: emailConfig.hideFooter,
        hideSignature: emailConfig.hideSignature,
      }}
    />
  );
}
