import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { SubDepartmentTimePage } from "@/components/time/sub-department-time-page";
import { OpsReportPanels } from "@/components/reports/ops-report-panels";
import { getProfileDeptScope } from "@/lib/dept-scope";

export const metadata = { title: "Reports — Support Ticketing System" };

export default async function ReportsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Reports is hidden from the agent role (nav link is hidden too).
  if (profile.role === "agent") redirect("/");

  const activeDeptId = (await getProfileDeptScope(profile))?.activeDeptId ?? null;
  // Tenant view (no department selected): tenant admin filters by department.
  // A selected department keeps the report inside that department.
  const tenantWide = profile.role === "admin" && !activeDeptId;

  return (
    <>
      {!tenantWide && <OpsReportPanels />}
      <SubDepartmentTimePage showDepartmentFilter={tenantWide} />
    </>
  );
}
