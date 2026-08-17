import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { getBoardCards, getTeamBoardGroups } from "@/lib/board-data";
import { TimelineViewPage } from "@/components/timeline/timeline-view-page";
import { getProfileDeptScope, resolveStatusTeamId } from "@/lib/dept-scope";
import { TimelinePageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Timeline — Ticketing System" };

async function TimelineData() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const cookieStore = await cookies();
  const cookieTeamId = cookieStore.get("pen_active_team")?.value ?? null;
  const membershipIds = profile.teamIds ?? [];

  const isManager = profile.role === "manager";
  const allowedDeptIds = isManager
    ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
    : undefined;

  const deptScope = await getProfileDeptScope(profile);

  resolveStatusTeamId({
    deptScope,
    cookieTeamId,
    membershipIds,
    primaryTeamId: profile.teamId,
  });

  const cards = deptScope
    ? await getBoardCards({ allowedDeptIds: deptScope.allowedDeptIds })
    : profile.role === "admin"
      ? await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" })
      : isManager && allowedDeptIds?.length
        ? await getBoardCards({ allowedDeptIds })
        : await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" });

  const teamBoardGroups = await getTeamBoardGroups(cards);

  return (
    <TimelineViewPage
      cards={cards}
      teamBoardGroups={teamBoardGroups}
    />
  );
}

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<TimelinePageSkeleton />}>
      <TimelineData />
    </Suspense>
  );
}
