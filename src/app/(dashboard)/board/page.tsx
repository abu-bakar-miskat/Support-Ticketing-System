import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { getBoardCards, getTeamBoardGroups } from "@/lib/board-data";
import { BoardPage } from "@/components/board/board-page";
import { BoardPageSkeleton } from "@/components/skeletons/page-skeletons";
import { getProfileDeptScope, resolveStatusTeamId } from "@/lib/dept-scope";

export const metadata = { title: "Board — Ticketing System" };

/** FLT-01/03: parses the URL's search/sub-status params into a board query fragment. */
function parseBoardSearchParams(sp: Record<string, string | string[] | undefined>) {
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const subStatusRaw = typeof sp.subStatus === "string" ? sp.subStatus.split(",") : [];
  const subStatusIn = subStatusRaw.filter(
    (s): s is "WAITING_FOR_SUPPORT" | "WAITING_FOR_CUSTOMER" =>
      s === "WAITING_FOR_SUPPORT" || s === "WAITING_FOR_CUSTOMER",
  );
  return { search: q, subStatusIn: subStatusIn.length > 0 ? subStatusIn : undefined };
}

async function BoardData({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [profile, cookieStore] = await Promise.all([getProfile(), cookies()]);
  if (!profile) redirect("/login");

  // FLT-05: a filtered/searched board view is bookmarkable/shareable — the
  // recipient still only ever sees their own in-scope tickets, since these
  // params only ever narrow the same scoped query built below (SD-06).
  const boardSearchParams = parseBoardSearchParams(searchParams);

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
        ...boardSearchParams,
        crossAccessUserId: profile.id,
        crossAccessDeptId: deptScope.activeDeptId,
      })
    : deptScope
      ? await getBoardCards({ ...boardSearchParams, allowedDeptIds: deptScope.allowedDeptIds })
      : profile.role === "admin"
        ? await getBoardCards({ ...boardSearchParams, tenantId: profile.activeTenantId ?? "__no_tenant__" })
        : isManager && allowedDeptIds?.length
          ? await getBoardCards({ ...boardSearchParams, allowedDeptIds })
          : await getBoardCards({ ...boardSearchParams, tenantId: profile.activeTenantId ?? "__no_tenant__" });

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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [profile, resolvedSearchParams] = await Promise.all([getProfile(), searchParams]);
  if (!profile) redirect("/login");

  // "Board" title + chrome paint in the fallback; cards stream in.
  return (
    <Suspense fallback={<BoardPageSkeleton />}>
      <BoardData searchParams={resolvedSearchParams} />
    </Suspense>
  );
}
