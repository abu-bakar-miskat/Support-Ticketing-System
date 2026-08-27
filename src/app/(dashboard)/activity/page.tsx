import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveActivityScope } from "@/lib/activity-scope";
import { buildActivityPageData } from "@/lib/activity-feed-data";
import { ActivityPage } from "@/components/activity/activity-page";
import { ActivityPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Activity — Support Ticketing System" };

async function ActivityData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const scope = await resolveActivityScope(profile, "active");
  const data = await buildActivityPageData(profile, sp, scope);

  return <ActivityPage {...data} />;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Activity is hidden from the agent role (nav link is hidden too).
  if (profile.role === "agent") redirect("/");

  return (
    <Suspense fallback={<ActivityPageSkeleton />}>
      <ActivityData searchParams={searchParams} />
    </Suspense>
  );
}
