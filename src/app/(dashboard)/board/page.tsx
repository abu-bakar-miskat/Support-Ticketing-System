import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { getBoardCards, getTeamBoardGroups } from "@/lib/board-data";
import { BoardPage } from "@/components/board/board-page";
import { BoardPageSkeleton } from "@/components/skeletons/page-skeletons";
import { getProfileDeptScope, resolveStatusTeamId } from "@/lib/dept-scope";

export const metadata = { title: "Board — Ticketing System" };

async function BoardData() {
  const [profile, cookieStore] = await Promise.all([getProfile(), cookies()]);
  if (!profile) redirect("/login");

  const cookieTeamId = cookieStore.get("pen_active_team")?.value ?? null;
  const membershipIds = profile.teamIds ?? [];

  const isManager = profile.role === "manager";
  const allowedDeptIds = isManager
    ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
    : undefined;

  const deptScope = await getProfileDeptScope(profile);

  const statusTeamId = resolveStatusTeamId({
    deptScope,
    cookieTeamId,
    membershipIds,
    primaryTeamId: profile.teamId,
  });

  const cards = deptScope?.isCrossAccessOnly && profile.id
    ? await getBoardCards({
        crossAccessUserId: profile.id,
        crossAccessDeptId: deptScope.activeDeptId,
      })
    : deptScope
      ? await getBoardCards({ allowedDeptIds: deptScope.allowedDeptIds })
      : profile.role === "admin"
        ? await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" })
        : isManager && allowedDeptIds?.length
          ? await getBoardCards({ allowedDeptIds })
          : await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" });

  const forceTeamIds = [...new Set([...(deptScope?.teamIds ?? []), ...membershipIds])];
  const teamBoardGroups = await getTeamBoardGroups(cards, forceTeamIds);

  return (
    <BoardPage
      cards={cards}
      teamBoardGroups={teamBoardGroups}
      defaultTeamId={statusTeamId}
    />
  );
}

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // "Board" title + chrome paint in the fallback; cards stream in.
  return (
    <Suspense fallback={<BoardPageSkeleton />}>
      <BoardData />
    </Suspense>
  );
}
