import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { SubDepartmentTimePage } from "@/components/time/sub-department-time-page";

export const metadata = { title: "Reports — Support Ticketing System" };

export default async function ReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Reports is hidden from the agent role (nav link is hidden too).
  if (profile.role === "agent") redirect("/");

  return <SubDepartmentTimePage />;
}
