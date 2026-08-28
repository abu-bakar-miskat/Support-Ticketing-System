import "server-only";
import { resolveSubDepartmentTeamIds } from "@/lib/role-assignment";

/**
 * SD-06: nested `notification.ticket` includes are not Prisma-extension
 * filtered. Drop tickets (or strip the ticket payload) that sit outside the
 * caller's sub-department allowlist.
 */
export { resolveSubDepartmentTeamIds };

export function ticketPayloadInScope(
  ticket: { subDepartmentId?: string | null } | null | undefined,
  allowedSubDepartmentIds: string[] | null,
): boolean {
  if (!ticket) return true;
  if (allowedSubDepartmentIds == null) return true;
  const subId = ticket.subDepartmentId ?? null;
  if (!subId) return false;
  return allowedSubDepartmentIds.includes(subId);
}
