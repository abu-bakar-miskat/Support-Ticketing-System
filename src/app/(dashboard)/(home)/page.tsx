import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Ticketing System" };

export default async function HomePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const activeDeptId = cookieStore.get("pen_active_dept")?.value || null;

  // Super-admins default to the platform-level tenants console — but only while
  // at the platform level. Once they've entered a department (active dept set),
  // Home behaves like the normal tenant dashboard with its usual layout.
  if (profile.isSuperAdmin && !activeDeptId) redirect("/tenants");

  if (profile.role === "manager") {
    const managedIds: string[] = (profile as any).managedDepartmentIds ?? [];
    // Only redirect to manager dashboard when in a dept they actually manage.
    if (!activeDeptId || managedIds.includes(activeDeptId)) {
      redirect("/manager");
    }
  }

  if (profile.role === "admin") {
    if (!activeDeptId) redirect("/departments");
  }

  // Paint greeting/clock immediately; HomeDashboard skeletons sections while fetching.
  return <HomeDashboard />;
}
