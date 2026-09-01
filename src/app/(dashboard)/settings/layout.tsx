import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { getTenantActiveFeatureKeys, getDepartmentActiveFeatureKeys } from "@/lib/template-catalogue";
import { listFeatureFlags } from "@/lib/feature-flags";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";

  // Determine if the user is operating in a cross-access department context
  const deptScope = await getProfileDeptScope(profile);
  const activeDeptId = deptScope?.activeDeptId ?? null;
  const isCrossAccess = checkIsCrossAccessDept(profile, activeDeptId);

  // Count pending join requests visible to this user
  let pendingCount = 0;
  if (isAdmin || isManager) {
    try {
      pendingCount = await (prisma.joinRequest as any).count({
        where: {
          status: "pending",
          ...(isAdmin ? {} : { subDepartmentId: { in: profile.subDepartmentIds } }),
        },
      });
    } catch {
      // joinRequest table may not be migrated yet in older envs
    }
  }

  const counts: Record<string, number> = {};
  if (pendingCount > 0) counts["/settings/sub-departments"] = pendingCount;

  // Inside a department, gate settings by that department's template features;
  // otherwise (tenant-level view) fall back to the tenant's active templates.
  const activeFeatureKeySet = activeDeptId
    ? await getDepartmentActiveFeatureKeys(activeDeptId)
    : profile.activeTenantId
      ? await getTenantActiveFeatureKeys(profile.activeTenantId)
      : "ALL";
  const activeFeatureKeys = activeFeatureKeySet === "ALL" ? "ALL" : Array.from(activeFeatureKeySet);
  const platformFlags = profile.activeTenantId
    ? await listFeatureFlags(profile.activeTenantId)
    : {};

  return (
    <SettingsLayout
      role={profile.role}
      counts={counts}
      isCrossAccess={isCrossAccess}
      isSuperAdmin={profile.isSuperAdmin}
      activeFeatureKeys={activeFeatureKeys}
      hasActiveDept={activeDeptId != null}
      platformFlags={platformFlags}
    >
      {children}
    </SettingsLayout>
  );
}
