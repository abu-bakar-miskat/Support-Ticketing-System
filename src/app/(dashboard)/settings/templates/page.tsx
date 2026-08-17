import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import {
  SettingsTemplatesPage,
  type TemplateRow,
} from "@/components/settings/settings-templates-page";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";

export const metadata = { title: "Ticket Templates — Ticketing System" };

export default async function SettingsTemplatesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins and managers can manage templates
  if (profile.role !== "admin" && profile.role !== "manager")
    redirect("/settings");

  const deptScope = await getProfileDeptScope(profile);

  if (checkIsCrossAccessDept(profile, deptScope?.activeDeptId ?? null)) redirect("/projects");

  // Fetch templates from current department
  const templates = await prisma.ticketTemplate.findMany({
    where: { departmentId: deptScope?.activeDeptId ?? null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      customFields: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    customFields: t.customFields as any[],
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return <SettingsTemplatesPage templates={rows} />;
}
