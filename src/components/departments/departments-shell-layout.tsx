import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getProfile } from "@/lib/profile";
import { getDashboardLayoutData } from "@/lib/dashboard-layout-data";
import { getTenantBranding } from "@/lib/tenant-config";
import { DepartmentsLayout } from "@/components/departments/departments-layout";
import { UserHydrator } from "@/components/providers/user-hydrator";

export async function DepartmentsShellLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const memberships = profile.memberships ?? [];
  if (profile.role !== "admin" && profile.role !== "manager" && memberships.length === 0) {
    redirect("/onboarding");
  }

  const [layoutData, tenantBranding] = await Promise.all([
    getDashboardLayoutData(profile),
    profile.activeTenantId ? getTenantBranding(profile.activeTenantId) : Promise.resolve(null),
  ]);

  return (
    <>
      <UserHydrator
        id={profile.id}
        email={profile.email}
        name={profile.name}
        avatarUrl={profile.avatarUrl}
        role={profile.role as Role}
        subDepartmentId={profile.subDepartmentId}
        subDepartmentIds={profile.subDepartmentIds}
        isSuperAdmin={profile.isSuperAdmin}
        memberships={memberships.map((m) => ({
          subDepartmentId: m.subDepartmentId,
          role: m.role,
        }))}
      />
      <DepartmentsLayout
        initialLayoutData={layoutData}
        brandingName={tenantBranding?.displayName ?? null}
        brandingLogoUrl={tenantBranding?.logoUrl ?? null}
      >
        {children}
      </DepartmentsLayout>
    </>
  );
}
