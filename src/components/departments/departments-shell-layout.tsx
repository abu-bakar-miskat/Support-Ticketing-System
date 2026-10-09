import { notFound, redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getProfile } from "@/lib/profile";
import { DepartmentsLayout } from "@/components/departments/departments-layout";
import { UserHydrator } from "@/components/providers/user-hydrator";
import { TenantUrlGuard } from "@/components/providers/tenant-url-guard";
import { getLayoutSeedFromProfile } from "@/lib/dashboard-layout-data";
import { getTenantBranding } from "@/lib/tenant-config";
import { TENANT_SIDEBAR_COLOR_DEFAULTS } from "@/lib/sidebar-colors";
import { TenantAccentStyle } from "@/components/theme/tenant-accent-style";
import { getProfileDeptScope } from "@/lib/dept-scope";

export async function DepartmentsShellLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.tenantContextInvalid) notFound();

  const memberships = profile.memberships ?? [];
  const hasTenantMembership = (profile.tenantMemberships ?? []).length > 0;
  if (
    profile.role !== "admin" &&
    profile.role !== "manager" &&
    memberships.length === 0 &&
    !hasTenantMembership
  ) {
    redirect("/onboarding");
  }

  const activeDeptId = (await getProfileDeptScope(profile))?.activeDeptId ?? null;

  const branding = profile.activeTenantId
    ? await getTenantBranding(profile.activeTenantId)
    : null;

  return (
    <>
      <TenantUrlGuard />
      <TenantAccentStyle accentColor={branding?.accentColor} />
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
        initialLayoutData={await getLayoutSeedFromProfile(profile, activeDeptId)}
        brandingName={branding?.displayName ?? null}
        brandingLogoUrl={branding?.logoUrl ?? null}
        brandingLogoUrlDark={branding?.logoUrlDark ?? null}
        brandingHideLogo={branding?.hideLogo ?? false}
        brandingHideDisplayName={branding?.hideDisplayName ?? false}
        sidebarColors={branding?.sidebarColors ?? TENANT_SIDEBAR_COLOR_DEFAULTS}
      >
        {children}
      </DepartmentsLayout>
    </>
  );
}
