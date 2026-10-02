import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { listMarketplaceTemplatesForTenant } from "@/lib/feature-marketplace";
import { FeaturesMarketplacePage } from "@/components/settings/features-marketplace-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feature marketplace — Departments — Global Support Portal" };

export default async function DepartmentsFeaturesRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const canRequest =
    !profile.isSuperAdmin && (profile.role === "admin" || profile.role === "manager");
  if (!canRequest && !profile.isSuperAdmin) redirect("/departments");

  const tenantId = profile.activeTenantId;
  if (!tenantId) redirect("/departments");

  const marketplace = await listMarketplaceTemplatesForTenant(tenantId);
  if (!marketplace) redirect("/departments");

  const departments =
    profile.isSuperAdmin || profile.role === "admin"
      ? marketplace.departments
      : marketplace.departments.filter((department) =>
          (profile.managedDepartmentIds ?? []).includes(department.id),
        );

  return (
    <FeaturesMarketplacePage
      tenantName={marketplace.tenantName}
      departments={departments}
      initialTemplates={marketplace.templates}
      canRequest={canRequest}
      canEnable={profile.isSuperAdmin}
    />
  );
}
