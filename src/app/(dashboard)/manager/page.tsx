import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { ManagerDashboardPage } from "@/components/manager/manager-dashboard-page";

export const metadata = { title: "Manager Dashboard — Support Ticketing System" };

export default async function ManagerPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  return <ManagerDashboardPage managerName={profile.name} />;
}
