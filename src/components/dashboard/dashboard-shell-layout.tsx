import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { getProfile } from "@/lib/profile";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserHydrator } from "@/components/providers/user-hydrator";
import { TenantUrlGuard } from "@/components/providers/tenant-url-guard";
import { Suspense } from "react";
import { getDashboardBadgesData } from "@/lib/dashboard-badges-data";
import { getLayoutSeedFromProfile } from "@/lib/dashboard-layout-data";
import { getTenantBranding } from "@/lib/tenant-config";
import { DashboardBadgesHydrator } from "./dashboard-badges-hydrator";
import type { AuthProfile } from "@/lib/auth";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { X_DEPARTMENT_SLUG_HEADER } from "@/lib/tenant-path";

async function DeferredBadges({ profile, activeDeptId }: { profile: AuthProfile; activeDeptId: string | null }) {
  const badges = await getDashboardBadgesData(profile).catch((error) => {
    console.error("[dashboard-badges] Could not load counts", error);
    return null;
  });
  return badges ? <DashboardBadgesHydrator badges={badges} userId={profile.id} activeDeptId={activeDeptId} /> : null;
}

export async function DashboardShellLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getProfile();
  } catch (err) {
    // Next signals control flow (dynamic-render bailout, redirect, notFound) by
    // throwing errors carrying a `digest`. These MUST propagate — swallowing them
    // defeats the bailout and, at build time, bakes the error page below into the
    // static output. Only genuine failures fall through to the log + error screen.
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string") throw err;
    // This catch is the only place the failure surfaces — without this log the
    // function logs contain nothing to diagnose the "Database unavailable" screen.
    console.error("[dashboard-layout] getProfile failed:", err);
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error ? err.message : null;
    return (
      <html lang="en" className="h-full">
        <body className="flex min-h-full flex-col items-center justify-center gap-4 bg-white p-8 dark:bg-gray-950">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
              <svg
                className="size-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="font-semibold text-gray-900 dark:text-white text-lg">
              Database unavailable
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We could not connect to the database. This is usually a configuration issue on the
              server.
            </p>
            {detail && (
              <pre className="w-full overflow-x-auto rounded-lg bg-gray-100 dark:bg-gray-900 p-3 text-left text-xs text-gray-700 dark:text-gray-300">
                {detail}
              </pre>
            )}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- A hard reload retries the failed database connection. */}
            <a
              href="/"
              className="mt-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try again
            </a>
          </div>
        </body>
      </html>
    );
  }

  if (!profile) redirect("/login");
  if (profile.tenantContextInvalid) notFound();

  // Dashboard layout sends agents/sub_managers with zero sub-department
  // memberships to /onboarding. Tenant membership alone is enough to stay in
  // the app after a tenant invite (dept/sub-dept cookies handle scope).
  const memberships = profile.memberships ?? [];
  const hasTenantMembership = (profile.tenantMemberships ?? []).length > 0;
  if (profile.isSuperAdmin) {
    // Super Admin is not a tenant member; they use the platform console.
  } else if (
    profile.role !== "admin" &&
    profile.role !== "manager" &&
    memberships.length === 0 &&
    !hasTenantMembership
  ) {
    redirect("/onboarding");
  }

  // Seed sidebar role/memberships from the profile so Home is usable immediately.
  // Full project lists still load in the background via `/api/dashboard/layout`.
  const deptScope = await getProfileDeptScope(profile);
  const requestedDeptSlug = (await headers()).get(X_DEPARTMENT_SLUG_HEADER);
  if (requestedDeptSlug && !deptScope) notFound();
  const activeDeptId = deptScope?.activeDeptId ?? null;

  // Show the active tenant's uploaded brand logo/name in the sidebar; falls back
  // to the default product logo for unbranded tenants (resolver returns nulls).
  const branding = profile.activeTenantId
    ? await getTenantBranding(profile.activeTenantId)
    : null;

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
      <DashboardLayout
        initialLayoutData={await getLayoutSeedFromProfile(profile, activeDeptId)}
        brandingName={branding?.displayName ?? null}
        brandingLogoUrl={branding?.logoUrl ?? null}
        brandingHideLogo={branding?.hideLogo ?? false}
        brandingHideDisplayName={branding?.hideDisplayName ?? false}
      >
        {children}
        <Suspense fallback={null}>
          <DeferredBadges profile={profile} activeDeptId={activeDeptId} />
        </Suspense>
      </DashboardLayout>
    </>
  );
}
