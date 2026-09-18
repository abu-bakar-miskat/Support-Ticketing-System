import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { DepartmentsLayout } from "@/components/departments/departments-layout";
import { UserHydrator } from "@/components/providers/user-hydrator";
import { TenantUrlGuard } from "@/components/providers/tenant-url-guard";
import { getLayoutSeedFromProfile } from "@/lib/dashboard-layout-data";

export async function DepartmentsShellLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

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

  const cookieStore = await cookies();
  const activeDeptId = cookieStore.get("pen_active_dept")?.value || null;

  return (
    <>
      <TenantUrlGuard />
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
      <DepartmentsLayout initialLayoutData={await getLayoutSeedFromProfile(profile, activeDeptId)}>
        {children}
      </DepartmentsLayout>
    </>
  );
}
