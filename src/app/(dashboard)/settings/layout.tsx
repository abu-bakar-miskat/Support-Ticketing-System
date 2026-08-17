import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { checkIsCrossAccessDept } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsLayout } from "@/components/settings/settings-layout";

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
          ...(isAdmin ? {} : { teamId: { in: profile.teamIds } }),
        },
      });
    } catch {
      // joinRequest table may not be migrated yet in older envs
    }
  }

  const counts: Record<string, number> = {};
  if (pendingCount > 0) counts["/settings/teams"] = pendingCount;

  return (
    <SettingsLayout role={profile.role} counts={counts} isCrossAccess={isCrossAccess} isSuperAdmin={profile.isSuperAdmin}>
      {children}
    </SettingsLayout>
  );
}
