import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { resolveSubDepartmentByName } from "@/lib/sub-department-access";
import { listScopeDomainRequests } from "@/lib/email-domain-requests";
import { SubDepartmentMailboxManager } from "@/components/sub-departments/sub-department-mailbox";

export const metadata = { title: "Mailbox — Support Ticketing System" };

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const { name } = await params;
  const subDepartment = await resolveSubDepartmentByName(decodeURIComponent(name), profile);
  if (!subDepartment) notFound();

  const canManage = profile.role === "admin" || profile.role === "manager";

  const tenantId = profile.activeTenantId ?? null;
  const domainRequests = tenantId
    ? await listScopeDomainRequests(tenantId, {
        departmentId: subDepartment.departmentId,
        subDepartmentId: subDepartment.id,
      })
    : [];

  return (
    <SubDepartmentMailboxManager
      subDepartmentId={subDepartment.id}
      subDepartmentName={subDepartment.name}
      prefix={subDepartment.prefix}
      departmentId={subDepartment.departmentId}
      assignmentMethod={subDepartment.assignmentMethod}
      canManage={canManage}
      canRequestDomain={canManage}
      domainRequests={domainRequests}
    />
  );
}
