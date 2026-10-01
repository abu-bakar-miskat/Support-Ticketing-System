import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { listMarketplaceForDepartment } from "@/lib/feature-marketplace";
import { FeaturesMarketplacePage } from "@/components/settings/features-marketplace-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Features marketplace — Global Support Portal" };

export default async function FeaturesSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" && !profile.isSuperAdmin) redirect("/settings");

  const departmentId = (await getProfileDeptScope(profile))?.activeDeptId ?? null;
  if (!departmentId) redirect("/departments");

  const marketplace = await listMarketplaceForDepartment(departmentId);
  if (!marketplace) redirect("/departments");

  return (
    <FeaturesMarketplacePage
      departmentId={marketplace.departmentId}
      departmentName={marketplace.departmentName}
      initialFeatures={marketplace.features}
    />
  );
}
