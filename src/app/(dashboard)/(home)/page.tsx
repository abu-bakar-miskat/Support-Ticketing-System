import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { dashboardHomeRedirect } from "@/lib/dashboard-home-routing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Support Ticketing System" };

export default async function HomePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const cookieStore = await cookies();
  const activeDeptId = cookieStore.get("pen_active_dept")?.value || null;

  // Admins default to their management console only before selecting a
  // department. Once "Enter workspace" sets the active-department cookie, Home
  // must render that workspace rather than bouncing back to the picker.
  const defaultDestination = dashboardHomeRedirect(profile, activeDeptId);
  if (defaultDestination) redirect(defaultDestination);

  return <HomeDashboard />;
}
