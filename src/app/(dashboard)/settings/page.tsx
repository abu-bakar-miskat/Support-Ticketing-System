import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { normalizeSignaturePrefs } from "@/lib/signature-prefs";
import { SettingsProfilePage } from "@/components/settings/settings-profile-page";

export const metadata = { title: "Settings — Global Support Portal" };

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const todayUtc = new Date(new Date().toISOString().slice(0, 10));
  const [schedule, memberships, holidays] = await Promise.all([
    prisma.memberSchedule.findUnique({ where: { userId: profile.id } }),
    prisma.subDepartmentMembership.findMany({
      where: {
        userId: profile.id,
        isActive: true,
        ...(profile.activeTenantId ? { subDepartment: { tenantId: profile.activeTenantId } } : {}),
      },
      select: {
        subDepartmentId: true,
        doNotAssign: true,
        subDepartment: { select: { name: true, department: { select: { name: true } } } },
      },
      orderBy: { subDepartment: { name: "asc" } },
    }),
    prisma.memberHoliday.findMany({
      where: { userId: profile.id, date: { gte: todayUtc } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, reason: true },
    }),
  ]);

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
      showAssignmentAvailability={!profile.isSuperAdmin && profile.role === "agent"}
      subDepartmentMemberships={memberships.map((m) => ({
        subDepartmentId: m.subDepartmentId,
        subDepartmentName: m.subDepartment.name,
        departmentName: m.subDepartment.department?.name ?? null,
        doNotAssign: m.doNotAssign,
      }))}
      holidays={holidays.map((h) => ({
        id: h.id,
        date: h.date.toISOString(),
        reason: h.reason,
      }))}
    />
  );
}
