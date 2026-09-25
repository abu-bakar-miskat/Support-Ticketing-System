import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { recordAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/lib/notify";
import { getPlatformSettings } from "@/lib/platform-settings";
import type { AgreementRenewalStatus } from "@/generated/prisma/enums";

/**
 * Tenant-Agreement operational gate.
 *
 * A tenant is only operational when a *valid* Agreement covers "now": the SA-02
 * Agreement record exists, today falls inside its [startDate, endDate] term, and
 * its renewalStatus hasn't settled the term as over (EXPIRED / CANCELLED). When
 * no such agreement exists the tenant is treated exactly like a suspended one
 * (SA-01) — its members are denied by getProfile, which every request funnels
 * through, so *all* tenant operations are blocked. Adding or renewing an
 * agreement makes the tenant valid again on the next request (getProfile is
 * re-evaluated per request / short cache TTL), so operations restore
 * automatically with no manual reactivation.
 *
 * Enforcement is a platform-wide opt-in (`enforceTenantAgreements`, default
 * off): the shared production DB has pre-existing tenants with no agreement rows
 * yet, and hard-blocking them by default would lock real users out. With the
 * setting off the validity is still computed and can be surfaced in the UI, but
 * login is never denied.
 */

/** Renewal statuses that still represent a live, honored term. */
export const AGREEMENT_ACTIVE_STATUSES: AgreementRenewalStatus[] = [
  "ACTIVE",
  "PENDING_RENEWAL",
  "RENEWED",
];

export type AgreementTermLike = {
  startDate: Date;
  endDate: Date;
  renewalStatus: AgreementRenewalStatus | string;
};

export type TenantAgreementValidity =
  | { valid: true; reason: null }
  | { valid: false; reason: "missing" | "expired" | "invalid" };

/**
 * Decide whether a tenant's most-relevant agreement term makes it operational
 * right now. `terms` is the tenant's agreements (any order); the caller usually
 * passes just the latest-endDate row, but this tolerates the full list.
 */
export function evaluateAgreementValidity(
  terms: AgreementTermLike[] | null | undefined,
  now: Date = new Date(),
): TenantAgreementValidity {
  if (!terms || terms.length === 0) return { valid: false, reason: "missing" };

  // A tenant is covered if ANY term is live: status still honored AND today is
  // inside the term window.
  const covered = terms.some(
    (t) =>
      AGREEMENT_ACTIVE_STATUSES.includes(t.renewalStatus as AgreementRenewalStatus) &&
      new Date(t.startDate).getTime() <= now.getTime() &&
      new Date(t.endDate).getTime() >= now.getTime(),
  );
  if (covered) return { valid: true, reason: null };

  // Not covered — distinguish "the term(s) lapsed" from "explicitly settled as
  // over" purely for the flag/UI copy.
  const anySettled = terms.some(
    (t) => t.renewalStatus === "EXPIRED" || t.renewalStatus === "CANCELLED",
  );
  const anyPastWindow = terms.some((t) => new Date(t.endDate).getTime() < now.getTime());
  if (anySettled || anyPastWindow) return { valid: false, reason: "expired" };
  return { valid: false, reason: "invalid" };
}

/** Load a tenant's agreements and evaluate validity in one query. */
export async function getTenantAgreementValidity(
  tenantId: string,
  now: Date = new Date(),
): Promise<TenantAgreementValidity> {
  const terms = await runAsSystem(() =>
    prisma.agreement.findMany({
      where: { tenantId },
      select: { startDate: true, endDate: true, renewalStatus: true },
    }),
  );
  return evaluateAgreementValidity(terms, now);
}

/** Whether the platform-wide hard block is switched on. */
export async function isAgreementEnforcementEnabled(): Promise<boolean> {
  // runAsSystem: this is read on the getProfile hot path, which runs before a
  // caller scope is established (see lib/request-scope).
  const { enforceTenantAgreements } = await runAsSystem(() => getPlatformSettings());
  return enforceTenantAgreements === true;
}

const REASON_LABEL: Record<"missing" | "expired" | "invalid", string> = {
  missing: "has no agreement on file",
  expired: "has an expired agreement",
  invalid: "has no currently valid agreement",
};

/**
 * How long to suppress re-flagging the same (tenant, user) attempt, so a client
 * that polls / re-renders doesn't spam every Super Admin. The durable ledger is
 * the AuditEvent trail itself.
 */
const FLAG_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Record a blocked-access attempt and flag every Super Admin.
 *
 * Idempotent within FLAG_THROTTLE_MS per (tenant, user): the last matching
 * AuditEvent acts as the throttle ledger, so repeated blocked requests in the
 * same window record and notify once. The notification carries the three facts
 * the acceptance criteria require — tenant identifier, the user who attempted
 * access, and the timestamp of the attempt.
 */
export async function flagTenantAccessWithoutAgreement(params: {
  tenantId: string;
  userId: string;
  reason: "missing" | "expired" | "invalid";
  at?: Date;
}): Promise<void> {
  const at = params.at ?? new Date();
  await runAsSystem(async () => {
    const recent = await prisma.auditEvent.findFirst({
      where: {
        tenantId: params.tenantId,
        actorId: params.userId,
        action: "TENANT_AGREEMENT_ACCESS_BLOCKED",
        createdAt: { gte: new Date(at.getTime() - FLAG_THROTTLE_MS) },
      },
      select: { id: true },
    });
    if (recent) return; // already flagged this attempt within the window

    const [tenant, actor] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: params.tenantId },
        select: { id: true, slug: true, name: true },
      }),
      prisma.profile.findUnique({
        where: { id: params.userId },
        select: { name: true, email: true },
      }),
    ]);
    if (!tenant) return;

    const who = actor?.name || actor?.email || params.userId;
    const tenantRef = `${tenant.name} (${tenant.slug})`;

    await recordAuditEvent({
      tenantId: params.tenantId,
      actorId: params.userId,
      action: "TENANT_AGREEMENT_ACCESS_BLOCKED",
      targetType: "Tenant",
      targetId: params.tenantId,
      after: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        userId: params.userId,
        reason: params.reason,
        attemptedAt: at.toISOString(),
      },
    });

    // `[access-blocked]` marker lets notify.ts render a block-specific title
    // while reusing the existing `agreement_expiring` super-admin channel (no
    // new NotificationType enum value → no shared-DB migration).
    const message = `[access-blocked] ${who} attempted to access ${tenantRef}, which ${REASON_LABEL[params.reason]}, at ${at.toISOString()}.`;

    const superAdmins = await prisma.profile.findMany({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    await Promise.all(
      superAdmins.map((admin) =>
        createNotification({ recipientId: admin.id, type: "agreement_expiring", message }),
      ),
    );
  });
}
