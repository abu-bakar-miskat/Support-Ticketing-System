import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { getEmailConfig } from "@/lib/email-config";
import { getTenantConfig } from "@/lib/tenant-config";
import { SettingsEmailPage } from "@/components/settings/settings-email-page";

export const metadata = { title: "Email settings — Support Ticketing System" };

function asConfigObject(
  value: unknown,
): Record<string, string | boolean> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, string | boolean>;
}

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  const { name } = await params;
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile);
  if (!subDepartment) notFound();

  // Email settings here are scoped to this sub-department (its own overrides
  // layered over the parent department → tenant → workspace defaults).
  const [tenant, emailConfig] = await Promise.all([
    profile.activeTenantId ? getTenantConfig(profile.activeTenantId) : Promise.resolve(null),
    getEmailConfig(subDepartment.departmentId, subDepartment.id),
  ]);
  const initialConfig = asConfigObject(tenant?.emailConfig);

  return (
    <SettingsEmailPage
      initialConfig={initialConfig}
      resendConfigured={Boolean(process.env.RESEND_API_KEY)}
      webhookConfigured={Boolean(process.env.RESEND_WEBHOOK_SECRET)}
      isAdmin={isAdmin}
      isManager={isManager}
      departments={[{ id: subDepartment.departmentId, name: subDepartment.name, subDepartmentId: subDepartment.id }]}
      fromName={emailConfig.fromName}
      fromEmail={emailConfig.fromEmail}
      branding={{
        brandColor: emailConfig.brandColor,
        headerColor: emailConfig.headerColor,
        logoUrl: emailConfig.logoUrl,
        footerText: emailConfig.footerText,
      }}
    />
  );
}
