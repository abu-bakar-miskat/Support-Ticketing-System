import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { listMarketplaceTemplatesForTenant } from "@/lib/feature-marketplace";
import { FeaturesMarketplacePage } from "@/components/settings/features-marketplace-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feature marketplace — Global Support Portal" };

export default async function FeaturesSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const canRequest =
    !profile.isSuperAdmin && (profile.role === "admin" || profile.role === "manager");
  if (!canRequest && !profile.isSuperAdmin) redirect("/settings");

  const tenantId = profile.activeTenantId;
  if (!tenantId) redirect("/settings");

  const marketplace = await listMarketplaceTemplatesForTenant(tenantId);
  if (!marketplace) redirect("/settings");

  return (
    <FeaturesMarketplacePage
      tenantId={marketplace.tenantId}
      tenantName={marketplace.tenantName}
      initialTemplates={marketplace.templates}
      canRequest={canRequest}
      canEnable={profile.isSuperAdmin}
    />
  );
}
