import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { listTenantDomains, listTenantDepartmentScopes } from "@/lib/email-domains";
import { listPendingDomainRequests } from "@/lib/email-domain-requests";
import { SettingsEmailDomains } from "@/components/settings/settings-email-domains";

export const metadata = { title: "Email domains — Global Support Portal" };
export const dynamic = "force-dynamic";

export default async function SettingsEmailDomainsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Sending domains are tenant-wide; only tenant admins manage them (matches the
  // Email settings page gate).
  if (profile.role !== "admin") redirect("/settings");

  const tenantId = profile.activeTenantId ?? null;
  const [domains, departments, domainRequests] = tenantId
    ? await Promise.all([
        listTenantDomains(tenantId),
        listTenantDepartmentScopes(tenantId),
        listPendingDomainRequests(tenantId),
      ])
    : [[], [], []];

  return (
    <SettingsEmailDomains
      initialDomains={domains}
      departments={departments}
      domainRequests={domainRequests}
      hasTenant={Boolean(tenantId)}
    />
  );
}
