import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getProfile } from "@/lib/profile";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { dashboardHomeRedirect } from "@/lib/dashboard-home-routing";
import { getProfileDeptScope } from "@/lib/dept-scope";
import {
  X_DEPARTMENT_SLUG_HEADER,
  X_TENANT_SLUG_HEADER,
} from "@/lib/tenant-path";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Global Support Portal" };

export default async function HomePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const activeDeptId = (await getProfileDeptScope(profile))?.activeDeptId ?? null;

  // Admins default to their management console only before selecting a
  // department. Once "Enter workspace" sets the active-department cookie, Home
  // must render that workspace rather than bouncing back to the picker.
  const defaultDestination = dashboardHomeRedirect(profile, activeDeptId);
  if (defaultDestination) {
    const headerStore = await headers();
    const tenantSlug = headerStore.get(X_TENANT_SLUG_HEADER);
    const departmentSlug = headerStore.get(X_DEPARTMENT_SLUG_HEADER);
    if (defaultDestination === "/departments" && tenantSlug) {
      redirect(`/${tenantSlug}/departments`);
    }
    if (defaultDestination === "/manager" && tenantSlug && departmentSlug) {
      redirect(`/${tenantSlug}/${departmentSlug}/manager`);
    }
    redirect(defaultDestination);
  }

  return <HomeDashboard />;
}
