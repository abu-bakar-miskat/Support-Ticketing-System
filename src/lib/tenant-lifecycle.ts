import "server-only";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastForceLogout } from "@/lib/realtime-broadcast";

/**
 * SA-01/SA-03: Super-Admin tenant lifecycle. Suspend and soft-delete are both
 * reversible and never touch any tenant data — they only flip `status`/
 * `deletedAt` on the Tenant row itself. Blocking login is enforced in
 * lib/profile.ts (getProfile), which every request already funnels through;
 * these functions additionally fan out a "next request" is not enough on its
 * own for already-open tabs, so a `force_logout` broadcast is sent to every
 * member of the affected tenant (see lib/realtime-broadcast.ts + the client
 * poll fallback at /api/session/status).
 */

const TENANT_STATUSES = ["active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export function isValidTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === "string" && (TENANT_STATUSES as readonly string[]).includes(value);
}

async function activeMemberIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantMembership.findMany({
    where: { tenantId, isActive: true },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function suspendTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) throw new Error("Tenant is soft-deleted — restore it first");
  if (before.status === "suspended") return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { status: "suspended" },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_SUSPENDED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  const memberIds = await activeMemberIds(params.tenantId);
  await broadcastForceLogout(memberIds, "Your organization's access has been suspended.");

  return updated;
}

export async function reactivateTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) throw new Error("Tenant is soft-deleted — restore it, not reactivate it");
  if (before.status === "active") return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { status: "active" },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_REACTIVATED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  return updated;
}

export async function softDeleteTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { deletedAt: new Date() },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_DELETED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  const memberIds = await activeMemberIds(params.tenantId);
  await broadcastForceLogout(memberIds, "Your organization's access has been removed.");

  return updated;
}

export async function restoreTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (!before.deletedAt) return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { deletedAt: null },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_RESTORED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  return updated;
}

/** True when a tenant's own status/deletedAt should deny its members' login (SA-01). */
export function tenantBlocksLogin(tenant: { status: string; deletedAt: Date | null }): boolean {
  return tenant.deletedAt !== null || tenant.status === "suspended";
}

/**
 * SA-01/SA-03: the explanatory message to show at the login screen, or null
 * when login may proceed. getProfile() enforces the same rules for every
 * request after the initial login (it just returns null, no message) — this
 * is only for surfacing *why* right at sign-in.
 */
export async function loginBlockReason(userId: string): Promise<string | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { isActive: true, isSuperAdmin: true, deletedAt: true },
  });
  if (!profile || profile.deletedAt) return null; // unknown/deleted — let normal flow handle it
  if (!profile.isActive) {
    return "Your account has been restricted. Contact your administrator for access.";
  }
  if (profile.isSuperAdmin) return null; // transcends tenant scope

  const memberships = await prisma.tenantMembership.findMany({
    where: { userId, isActive: true },
    select: { tenant: { select: { status: true, deletedAt: true } } },
  });
  if (memberships.length === 0) return null; // no tenant to be blocked from
  const allBlocked = memberships.every((m) => tenantBlocksLogin(m.tenant));
  if (!allBlocked) return null;

  const anyDeleted = memberships.some((m) => m.tenant.deletedAt !== null);
  return anyDeleted
    ? "Your organization's access has been removed. Contact your administrator."
    : "Your organization's access has been suspended. Contact your administrator.";
}
