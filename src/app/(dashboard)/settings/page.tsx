import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { normalizeSignaturePrefs } from "@/lib/signature-prefs";
import { SettingsProfilePage } from "@/components/settings/settings-profile-page";

export const metadata = { title: "Settings — Support Ticketing System" };

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const schedule = await prisma.memberSchedule.findUnique({
    where: { userId: profile.id },
  });

  const signature = normalizeSignaturePrefs(profile.preferences);

  return (
    <SettingsProfilePage
      name={profile.name}
      email={profile.email}
      role={profile.role === "sub_manager" ? "Sub-manager" : profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
      timezone={profile.timezone ?? "Europe/London"}
      avatarUrl={profile.avatarUrl}
      location={profile.location ?? ""}
      workingDays={schedule?.workingDays ?? [1, 2, 3, 4, 5]}
      workStartTime={schedule?.workStartTime ?? "09:00"}
      workEndTime={schedule?.workEndTime ?? "17:00"}
      signature={signature}
    />
  );
}
