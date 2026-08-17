import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { getTenantConfig } from "@/lib/tenant-config";
import { SettingsTimeTrackingApprovalsPage } from "@/components/settings/settings-time-tracking-page";

export const metadata = {
  title: "Approvals — Time tracking — Settings — Ticketing System",
};

function asConfigObject(
  value: unknown,
): Record<string, string | boolean> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, string | boolean>;
}

export default async function SettingsTimeTrackingApprovalsRoute() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Only admins can manage approval settings
  if (profile.role !== "admin") redirect("/settings");

  const [tenant, approvers] = await Promise.all([
    profile.activeTenantId ? getTenantConfig(profile.activeTenantId) : Promise.resolve(null),
    prisma.profile.findMany({
      where: {
        role: { in: ["admin", "manager", "lead"] },
        tenantMemberships: { some: { tenantId: profile.activeTenantId ?? "__no_tenant__", isActive: true } },
      },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const initialConfig = asConfigObject(tenant?.approvalsConfig);

  let approverOptions = approvers.map((approver) => approver.name);
  const storedApprover = initialConfig?.approver;
  if (
    typeof storedApprover === "string" &&
    storedApprover &&
    !approverOptions.includes(storedApprover)
  ) {
    approverOptions = [storedApprover, ...approverOptions];
  }

  return (
    <SettingsTimeTrackingApprovalsPage
      initialConfig={initialConfig}
      approverOptions={approverOptions.length ? approverOptions : undefined}
    />
  );
}
