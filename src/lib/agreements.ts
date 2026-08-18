import "server-only";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/lib/notify";
import type { AgreementRenewalStatus } from "@/generated/prisma/enums";

/**
 * SA-02: a Super-Admin-maintained administrative record of a tenant's
 * agreement term — deliberately not a billing/subscription model (no
 * amounts, invoices, or payment fields). A tenant can have several Agreement
 * rows over time (one per renewal term); the "current" one is whichever has
 * the latest endDate.
 */

const AGREEMENT_SELECT = {
  id: true,
  tenantId: true,
  startDate: true,
  endDate: true,
  renewalStatus: true,
  reminderDaysBefore: true,
  sentReminderDays: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  documents: {
    select: {
      id: true,
      storageUrl: true,
      fileName: true,
      fileSize: true,
      uploadedById: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" } as const,
  },
} as const;

export function listAgreementsForTenant(tenantId: string) {
  return prisma.agreement.findMany({
    where: { tenantId },
    select: AGREEMENT_SELECT,
    orderBy: { endDate: "desc" },
  });
}

/** The tenant's current term — the row with the latest endDate, if any. */
export function getCurrentAgreement(tenantId: string) {
  return prisma.agreement.findFirst({
    where: { tenantId },
    select: AGREEMENT_SELECT,
    orderBy: { endDate: "desc" },
  });
}

export async function createAgreement(params: {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  renewalStatus?: AgreementRenewalStatus;
  reminderDaysBefore?: number[];
  actorId: string;
}) {
  const agreement = await prisma.agreement.create({
    data: {
      tenantId: params.tenantId,
      startDate: params.startDate,
      endDate: params.endDate,
      renewalStatus: params.renewalStatus ?? "ACTIVE",
      reminderDaysBefore: params.reminderDaysBefore ?? [60, 30, 7],
      createdById: params.actorId,
    },
    select: AGREEMENT_SELECT,
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "AGREEMENT_CREATED",
    targetType: "Agreement",
    targetId: agreement.id,
    before: null,
    after: agreement,
  });

  return agreement;
}

export async function updateAgreement(params: {
  id: string;
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  renewalStatus?: AgreementRenewalStatus;
  reminderDaysBefore?: number[];
  actorId: string;
}) {
  const before = await prisma.agreement.findFirst({
    where: { id: params.id, tenantId: params.tenantId },
    select: AGREEMENT_SELECT,
  });
  if (!before) return null;

  const data: {
    startDate?: Date;
    endDate?: Date;
    renewalStatus?: AgreementRenewalStatus;
    reminderDaysBefore?: number[];
    // Changing the reminder window invalidates any reminders already sent
    // against the old window, so a new date/window starts a fresh ledger.
    sentReminderDays?: number[];
  } = {};
  if (params.startDate !== undefined) data.startDate = params.startDate;
  if (params.endDate !== undefined) {
    data.endDate = params.endDate;
    data.sentReminderDays = [];
  }
  if (params.renewalStatus !== undefined) data.renewalStatus = params.renewalStatus;
  if (params.reminderDaysBefore !== undefined) {
    data.reminderDaysBefore = params.reminderDaysBefore;
    data.sentReminderDays = [];
  }

  const updated = await prisma.agreement.update({
    where: { id: params.id },
    data,
    select: AGREEMENT_SELECT,
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "AGREEMENT_UPDATED",
    targetType: "Agreement",
    targetId: params.id,
    before,
    after: updated,
  });

  return updated;
}

export async function addAgreementDocument(params: {
  agreementId: string;
  tenantId: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
  actorId: string;
}) {
  const agreement = await prisma.agreement.findFirst({
    where: { id: params.agreementId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!agreement) return null;

  const document = await prisma.agreementDocument.create({
    data: {
      agreementId: params.agreementId,
      storageUrl: params.storageUrl,
      fileName: params.fileName,
      fileSize: params.fileSize,
      uploadedById: params.actorId,
    },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "AGREEMENT_DOCUMENT_ADDED",
    targetType: "AgreementDocument",
    targetId: document.id,
    before: null,
    after: document,
  });

  return document;
}

export async function deleteAgreementDocument(params: {
  documentId: string;
  tenantId: string;
  actorId: string;
}) {
  const document = await prisma.agreementDocument.findFirst({
    where: { id: params.documentId, agreement: { tenantId: params.tenantId } },
  });
  if (!document) return false;

  await prisma.agreementDocument.delete({ where: { id: params.documentId } });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "AGREEMENT_DOCUMENT_REMOVED",
    targetType: "AgreementDocument",
    targetId: params.documentId,
    before: document,
    after: null,
  });

  return true;
}

export type TenantAgreementSummaryRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  agreementEndDate: Date | null;
  renewalStatus: AgreementRenewalStatus | null;
  departmentCount: number;
  activeUserCount: number;
};

/** SA-05: Super-Admin summary — status, agreement end date, department and active-user counts per tenant. */
export async function listTenantAgreementSummaries(): Promise<TenantAgreementSummaryRow[]> {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { departments: true } },
      memberships: { where: { isActive: true }, select: { id: true } },
      agreements: {
        select: { endDate: true, renewalStatus: true },
        orderBy: { endDate: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return tenants.map((tenant) => {
    const current = tenant.agreements[0];
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      agreementEndDate: current?.endDate ?? null,
      renewalStatus: current?.renewalStatus ?? null,
      departmentCount: tenant._count.departments,
      activeUserCount: tenant.memberships.length,
    };
  });
}

/**
 * SA-06: notifies every Super Admin once per (agreement, reminderDay) pair as
 * a term approaches its endDate. `sentReminderDays` is the idempotency
 * ledger — a day only fires once per agreement, safe to call repeatedly from
 * a cron sweep. In-app notifications only for now (no outbound email), see
 * ticket #21.
 */
export async function sweepAgreementReminders(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.agreement.findMany({
    where: {
      renewalStatus: { in: ["ACTIVE", "PENDING_RENEWAL"] },
      endDate: { gte: now },
    },
    select: {
      id: true,
      tenantId: true,
      endDate: true,
      reminderDaysBefore: true,
      sentReminderDays: true,
      tenant: { select: { name: true } },
    },
  });

  let notified = 0;
  const superAdmins = await prisma.profile.findMany({
    where: { isSuperAdmin: true },
    select: { id: true },
  });
  if (superAdmins.length === 0) return 0;

  for (const agreement of candidates) {
    const daysUntilExpiry = Math.ceil(
      (agreement.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    // Of the not-yet-sent thresholds that have been crossed, fire the
    // tightest (smallest) one first — e.g. if a sweep was missed and both the
    // 60- and 30-day marks have passed, the 30-day reminder is the one that
    // still matters.
    const dueDay = agreement.reminderDaysBefore
      .filter((day) => !agreement.sentReminderDays.includes(day) && daysUntilExpiry <= day)
      .sort((a, b) => a - b)[0];
    if (dueDay === undefined) continue;

    for (const admin of superAdmins) {
      await createNotification({
        recipientId: admin.id,
        type: "agreement_expiring",
        message: `${agreement.tenant.name}'s agreement expires in ${daysUntilExpiry} day(s) (${agreement.endDate.toISOString().slice(0, 10)}).`,
      });
    }

    await prisma.agreement.update({
      where: { id: agreement.id },
      data: { sentReminderDays: { push: dueDay } },
    });
    notified += 1;
  }

  return notified;
}
