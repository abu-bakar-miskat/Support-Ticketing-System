import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { ManagerDashboardPage } from "@/components/manager/manager-dashboard-page";

export const metadata = { title: "Manager Dashboard — Global Support Portal" };

export default async function ManagerPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  return <ManagerDashboardPage managerName={profile.name} />;
}
