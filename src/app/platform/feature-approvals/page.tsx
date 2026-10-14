import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { listPendingFeatureRequests } from "@/lib/feature-marketplace";
import { FeatureApprovalsPage } from "@/components/platform/feature-approvals-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feature approvals — Global Support Portal" };

export default async function PlatformFeatureApprovalsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.isSuperAdmin) redirect("/");

  const requests = await listPendingFeatureRequests();
  return <FeatureApprovalsPage initialRequests={requests} />;
}
