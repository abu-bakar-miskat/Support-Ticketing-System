import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import {
  SettingsTagsPage,
  type TagRow,
} from "@/components/settings/settings-tags-page";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";

export const metadata = { title: "Tags & labels — Ticketing System" };

export default async function SettingsTagsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins and managers can manage tags & labels
  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "lead")
    redirect("/settings");

  const deptScope = await getProfileDeptScope(profile);

  if (checkIsCrossAccessDept(profile, deptScope?.activeDeptId ?? null)) redirect("/projects");

  // Fetch labels from registry
  const registryLabels = await prisma.label.findMany({
    where: { departmentId: deptScope?.activeDeptId ?? null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  // Count tickets per label
  const tickets = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      ...(deptScope ? { teamId: { in: deptScope.teamIds } } : {}),
    },
    select: { labels: true },
  });

  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    for (const label of ticket.labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const labels: TagRow[] = registryLabels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    count: counts.get(l.name) ?? 0,
  }));

  return <SettingsTagsPage labels={labels} />;
}
