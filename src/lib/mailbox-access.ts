import "server-only";
import { NextResponse } from "next/server";
import { canAdminDeptSettings } from "@/lib/dept-scope";
import type { AuthProfile } from "@/lib/auth";

/**
 * Who may manage a mailbox connection (role-hierarchy.md): a department or
 * sub-department mailbox needs an admin of that department (or a tenant
 * admin); the tenant-wide mailbox needs an admin of that tenant.
 */
export function assertMailboxAdmin(
  caller: AuthProfile,
  connection: { tenantId: string; departmentId: string | null },
): NextResponse | null {
  if (connection.departmentId) {
    return canAdminDeptSettings(caller, connection.departmentId)
      ? null
      : NextResponse.json({ error: "You must be an admin of this department." }, { status: 403 });
  }
  const tenantAdmin = caller.isSuperAdmin || (caller.role === "admin" && caller.activeTenantId === connection.tenantId);
  return tenantAdmin
    ? null
    : NextResponse.json({ error: "Only an organisation admin can manage its mailbox." }, { status: 403 });
}
