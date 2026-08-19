import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getProfile } from "@/lib/profile";
import { getDashboardLayoutData } from "@/lib/dashboard-layout-data";
import { getTenantBranding } from "@/lib/tenant-config";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { UserHydrator } from "@/components/providers/user-hydrator";

export default async function Layout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getProfile();
  } catch (err) {
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
            <a
              href="/"
              className="mt-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try again
            </a>
          </div>
        </body>
      </html>
    );
  }

  if (!profile) redirect("/login");

  const memberships = profile.memberships ?? [];
  if (profile.role !== "admin" && profile.role !== "manager" && memberships.length === 0) {
    redirect("/onboarding");
  }

  const [layoutData, branding] = await Promise.all([
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
        memberships={memberships.map((m) => ({
          subDepartmentId: m.subDepartmentId,
          role: m.role,
        }))}
      />
      {/* Per-tenant branding: only the logo + name change in the shell — the
          app keeps its default theme colour for every tenant. */}
      <DashboardLayout
        initialLayoutData={layoutData}
        brandingName={branding?.displayName ?? null}
        brandingLogoUrl={branding?.logoUrl ?? null}
      >
        {children}
      </DashboardLayout>
    </>
  );
}
