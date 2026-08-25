import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveActivityScope } from "@/lib/activity-scope";
import { buildActivityPageData } from "@/lib/activity-feed-data";
import { ActivityPage } from "@/components/activity/activity-page";
import { ActivityPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Activity — Support Ticketing System" };

async function AllDepartmentsActivityData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  // "all" scope = every department the caller can reach (tenant-wide for admins).
  const scope = await resolveActivityScope(profile, "all");
  const data = await buildActivityPageData(profile, sp, scope);

  return <ActivityPage {...data} basePath="/departments/activity" scope="all" />;
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
      <AllDepartmentsActivityData searchParams={searchParams} />
    </Suspense>
  );
}
