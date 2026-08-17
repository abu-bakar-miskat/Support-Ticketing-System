import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { SettingsNotificationsPage } from "@/components/settings/settings-notifications-page";

export const metadata = { title: "Notifications — Ticketing System" };

function asPrefsObject(value: unknown): Record<string, boolean> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, boolean>;
}

export default async function SettingsNotificationsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const initialPreferences = asPrefsObject(profile.notificationPrefs);

  return <SettingsNotificationsPage initialPreferences={initialPreferences} />;
}
