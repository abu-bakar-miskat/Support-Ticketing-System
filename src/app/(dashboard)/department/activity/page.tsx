import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveActivityScope } from "@/lib/activity-scope";
import { buildActivityPageData } from "@/lib/activity-feed-data";
import { ActivityPage } from "@/components/activity/activity-page";
import { ActivityPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Department activity — Support Ticketing System" };

async function DepartmentActivityData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/activity");

  const sp = await searchParams;
  // "active" scope = the caller's active department (its sub-departments).
  const scope = await resolveActivityScope(profile, "active");
  if (scope.subDepartmentIds.length === 0 && profile.role !== "admin") redirect("/departments");

  const data = await buildActivityPageData(profile, sp, scope);

  return <ActivityPage {...data} basePath="/department/activity" />;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<ActivityPageSkeleton />}>
      <DepartmentActivityData searchParams={searchParams} />
    </Suspense>
  );
}
