import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  X_DEPARTMENT_SLUG_HEADER,
  X_SUBDEPARTMENT_SLUG_HEADER,
  X_TENANT_SLUG_HEADER,
  withTenantContext,
} from "@/lib/tenant-path";

export default async function TicketRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestHeaders = await headers();
  redirect(withTenantContext(
    {
      tenantSlug: requestHeaders.get(X_TENANT_SLUG_HEADER),
      departmentSlug: requestHeaders.get(X_DEPARTMENT_SLUG_HEADER),
      subDepartmentSlug: requestHeaders.get(X_SUBDEPARTMENT_SLUG_HEADER),
    },
    `/tasks/${id}`,
  ));
}
