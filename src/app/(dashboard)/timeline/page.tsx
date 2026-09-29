import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getBoardCards, getSubDepartmentBoardGroups } from "@/lib/board-data";
import { TimelineViewPage } from "@/components/timeline/timeline-view-page";
import {
  getProfileDeptScope,
  getRequestSubDepartmentId,
  resolveStatusSubDepartmentId,
} from "@/lib/dept-scope";
import { TimelinePageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Timeline — Global Support Portal" };

async function TimelineData() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const membershipIds = profile.subDepartmentIds ?? [];

  const isManager = profile.role === "manager";
  const allowedDeptIds = isManager
    ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
    : undefined;

  const deptScope = await getProfileDeptScope(profile);
  const requestSubDepartmentId = await getRequestSubDepartmentId(profile, deptScope);

  resolveStatusSubDepartmentId({
    deptScope,
    cookieSubDepartmentId: requestSubDepartmentId,
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
