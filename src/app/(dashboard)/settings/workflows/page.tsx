import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { SettingsWorkflowsPage } from "@/components/settings/settings-workflows-page";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";

export const metadata = { title: "Workflows & statuses — Ticketing System" };

export default async function SettingsWorkflowsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isLead = profile.role === "lead";

  if (!isAdmin && !isManager && !isLead) redirect("/settings");

  const deptScope = await getProfileDeptScope(profile);

  if (checkIsCrossAccessDept(profile, deptScope?.activeDeptId ?? null)) redirect("/projects");

  // Build the team filter scoped to the user's access level
  const allowedDeptIds = isManager
    ? [...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])]
    : [];
  const leadTeamIds = isLead
    ? (profile.teamIds?.length ? profile.teamIds : profile.teamId ? [profile.teamId] : [])
    : [];

  const activeDeptId = deptScope?.activeDeptId ?? null;

  const teamWhere = isAdmin
    ? activeDeptId ? { departmentId: activeDeptId } : { tenantId: profile.activeTenantId ?? "__no_tenant__" }   // admin: active dept, else whole tenant
    : isManager
      ? deptScope?.teamIds?.length
        ? { id: { in: deptScope.teamIds } }
        : allowedDeptIds.length
          ? { departmentId: { in: allowedDeptIds } }
          : { id: { in: [] as string[] } }
      : { id: { in: leadTeamIds.length ? leadTeamIds : [] as string[] } };

  const teams = await prisma.team.findMany({
    where: teamWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, prefix: true },
  });

  const defaultTeamId = teams[0]?.id ?? null;

  const initialStatuses = defaultTeamId
    ? await prisma.teamStatus.findMany({
        where: { teamId: defaultTeamId },
        orderBy: { order: "asc" },
        select: { id: true, label: true, color: true, order: true, isComplete: true, allowedLabels: true },
      })
    : [];

  return (
    <SettingsWorkflowsPage
      teams={teams}
      defaultTeamId={defaultTeamId}
      initialStatuses={initialStatuses}
    />
  );
}
