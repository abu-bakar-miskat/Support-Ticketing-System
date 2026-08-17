import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getTenantConfig } from "@/lib/tenant-config";
import { SettingsTimeTrackingConfigurationPage } from "@/components/settings/settings-time-tracking-page";

export const metadata = {
  title: "Configuration — Time tracking — Settings — Ticketing System",
};

function asConfigObject(
  value: unknown,
): Record<string, string | boolean> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, string | boolean>;
}

export default async function SettingsTimeTrackingConfigurationRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins can configure time tracking settings
  if (profile.role !== "admin") redirect("/settings");

  const tenant = profile.activeTenantId ? await getTenantConfig(profile.activeTenantId) : null;
  const initialConfig = asConfigObject(tenant?.timeTrackingConfig);

  return <SettingsTimeTrackingConfigurationPage initialConfig={initialConfig} />;
}
