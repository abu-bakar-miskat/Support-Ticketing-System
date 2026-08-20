import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { getBoardCards, getSubDepartmentBoardGroups } from "@/lib/board-data";
import { TimelineViewPage } from "@/components/timeline/timeline-view-page";
import { getProfileDeptScope, resolveStatusSubDepartmentId } from "@/lib/dept-scope";
import { TimelinePageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Timeline — Support Ticketing System" };

async function TimelineData() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const cookieStore = await cookies();
  const cookieSubDepartmentId = cookieStore.get("pen_active_team")?.value ?? null;
  const membershipIds = profile.subDepartmentIds ?? [];

  const isManager = profile.role === "manager";
  const allowedDeptIds = isManager
    ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
    : undefined;

  const deptScope = await getProfileDeptScope(profile);

  resolveStatusSubDepartmentId({
    deptScope,
    cookieSubDepartmentId,
    membershipIds,
    primarySubDepartmentId: profile.subDepartmentId,
  });

  const cards = deptScope
    ? await getBoardCards({ allowedDeptIds: deptScope.allowedDeptIds })
    : profile.role === "admin"
      ? await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" })
      : isManager && allowedDeptIds?.length
        ? await getBoardCards({ allowedDeptIds })
        : await getBoardCards({ tenantId: profile.activeTenantId ?? "__no_tenant__" });

  const subDepartmentBoardGroups = await getSubDepartmentBoardGroups(cards);

  return (
    <TimelineViewPage
      cards={cards}
      subDepartmentBoardGroups={subDepartmentBoardGroups}
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
