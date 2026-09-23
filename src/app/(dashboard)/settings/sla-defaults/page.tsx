import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { TenantSlaSettingsPage } from "@/components/settings/tenant-sla-settings-page";

export const metadata = { title: "SLA defaults — Support Ticketing System" };

export default async function SettingsSlaDefaultsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Tenant-level defaults are a tenant-admin surface (matches the "adminOnly"
  // nav gate). Department Heads configure their own SLA under /settings/sla.
  if (profile.role !== "admin" && !profile.isSuperAdmin) redirect("/settings");
  if (!profile.activeTenantId) redirect("/settings");

  return <TenantSlaSettingsPage />;
}
