import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { SettingsAppearancePage } from "@/components/settings/settings-appearance-page";
import { parseFontSize } from "@/lib/font-size";

export const metadata = { title: "Appearance — Ticketing System" };

function readFontSizePref(preferences: unknown) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return "default" as const;
  }
  return parseFontSize((preferences as Record<string, unknown>).fontSize);
}

export default async function SettingsAppearanceRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <SettingsAppearancePage initialFontSize={readFontSizePref(profile.preferences)} />
  );
}
