import { MembersPageView } from "@/app/(dashboard)/settings/members/page";

// The org-level Users roster always shows the whole tenant, ignoring any active
// department cookie (see MembersPageView's forceTenantWide note).
export default async function DepartmentsUsersRoute() {
  return MembersPageView({ forceTenantWide: true });
}

export const metadata = { title: "Users — Departments — Global Support Portal" };
