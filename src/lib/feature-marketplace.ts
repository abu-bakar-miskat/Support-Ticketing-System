import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/lib/notify";
import {
  MARKETPLACE_FEATURE_DESCRIPTIONS,
  MARKETPLACE_FEATURE_GROUPS,
  MARKETPLACE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  grantedMarketplaceFeatures,
  isMarketplaceFeatureKey,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import type { FeatureRequestStatus } from "@/generated/prisma/enums";
import type { MarketplaceFeature, PendingFeatureRequest } from "@/lib/feature-marketplace-types";

export type { MarketplaceFeature, PendingFeatureRequest };

async function grantDepartmentFeature(
  tx: Prisma.TransactionClient,
  departmentId: string,
  key: MarketplaceFeatureKey,
) {
  const dept = await tx.department.findUnique({
    where: { id: departmentId },
    select: { featureKeys: true },
  });
  if (!dept) throw new Error("Department not found");
  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  if (granted === "ALL" || granted.includes(key)) return;
  await tx.department.update({
    where: { id: departmentId },
    data: { featureKeys: [...granted, key] },
  });
}

function explicitMarketplaceKeys(raw: unknown): MarketplaceFeatureKey[] {
  const granted = grantedMarketplaceFeatures(raw);
  const set = new Set<MarketplaceFeatureKey>(granted === "ALL" ? MARKETPLACE_FEATURE_KEYS : granted);
  return MARKETPLACE_FEATURE_KEYS.filter((key) => set.has(key));
}

/** Whether every department in the tenant currently has each marketplace feature. */
export async function listTenantDepartmentFeatures(
  tenantId: string,
): Promise<Record<MarketplaceFeatureKey, boolean>> {
  const departments = await prisma.department.findMany({
    where: { tenantId },
    select: { featureKeys: true },
  });
  const result = {} as Record<MarketplaceFeatureKey, boolean>;
  for (const key of MARKETPLACE_FEATURE_KEYS) {
    result[key] =
      departments.length > 0 &&
      departments.every((dept) => {
        const granted = grantedMarketplaceFeatures(dept.featureKeys);
        return granted === "ALL" || granted.includes(key);
      });
  }
  return result;
}

/**
 * Grant or remove marketplace features on every department in a tenant.
 * `key: null` applies the change to the whole set. Pending requests for a
 * feature that is granted here are approved so they leave the queue.
 */
export async function setTenantDepartmentFeatures(params: {
  tenantId: string;
  key: MarketplaceFeatureKey | null;
  enabled: boolean;
  actorId: string;
}): Promise<Record<MarketplaceFeatureKey, boolean>> {
  const pending = params.enabled
    ? await prisma.featureRequest.findMany({
        where: {
          tenantId: params.tenantId,
          status: "PENDING",
          ...(params.key ? { featureKey: params.key } : {}),
        },
        select: { id: true, featureKey: true, requestedById: true, department: { select: { name: true } } },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    const departments = await tx.department.findMany({
      where: { tenantId: params.tenantId },
      select: { id: true, featureKeys: true },
    });
    for (const dept of departments) {
      const current = explicitMarketplaceKeys(dept.featureKeys);
      const next = params.key
        ? MARKETPLACE_FEATURE_KEYS.filter((key) => {
            if (key === params.key) return params.enabled;
            return current.includes(key);
          })
        : params.enabled
          ? [...MARKETPLACE_FEATURE_KEYS]
          : [];
      if (current.length === next.length && current.every((key, index) => key === next[index])) continue;
      await tx.department.update({
        where: { id: dept.id },
        data: { featureKeys: next },
      });
    }
    if (pending.length > 0) {
      await tx.featureRequest.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: {
          status: "APPROVED",
          reviewedById: params.actorId,
          reviewedAt: new Date(),
          reviewNote: "Granted for every department in the tenant.",
        },
      });
    }
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: params.enabled ? "TENANT_FEATURES_ENABLED" : "TENANT_FEATURES_DISABLED",
    targetType: "Tenant",
    targetId: params.tenantId,
    after: { featureKey: params.key ?? "ALL", enabled: params.enabled },
  });

  await Promise.all(
    pending.map((row) => {
      const label = isMarketplaceFeatureKey(row.featureKey)
        ? TEMPLATE_FEATURE_LABELS[row.featureKey]
        : row.featureKey;
      return createNotification({
        recipientId: row.requestedById,
        actorId: params.actorId,
        type: "feature_request_reviewed",
        message: `${label} is now available in ${row.department.name}.`,
      });
    }),
  );

  return listTenantDepartmentFeatures(params.tenantId);
}

export async function listMarketplaceForDepartment(departmentId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, featureKeys: true },
  });
  if (!dept) return null;

  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  const enabled = new Set<string>(granted === "ALL" ? MARKETPLACE_FEATURE_KEYS : granted);
  const pending = await prisma.featureRequest.findMany({
    where: { departmentId, status: "PENDING" },
    select: { featureKey: true },
  });
  const pendingKeys = new Set(pending.map((row) => row.featureKey));
  const groupOf = new Map<MarketplaceFeatureKey, string>();
  for (const group of MARKETPLACE_FEATURE_GROUPS) {
    for (const key of group.keys) groupOf.set(key, group.label);
  }

  const features: MarketplaceFeature[] = MARKETPLACE_FEATURE_KEYS.map((key) => ({
    key,
    label: TEMPLATE_FEATURE_LABELS[key],
    description: MARKETPLACE_FEATURE_DESCRIPTIONS[key],
    group: groupOf.get(key) ?? "Features",
    status: enabled.has(key) ? "enabled" : pendingKeys.has(key) ? "pending" : "available",
  }));

  return { departmentId: dept.id, departmentName: dept.name, features };
}

export async function requestDepartmentFeature(params: {
  tenantId: string;
  departmentId: string;
  featureKey: string;
  requestedById: string;
  message?: string;
}) {
  if (!isMarketplaceFeatureKey(params.featureKey)) {
    throw new Error("That isn't a feature you can request");
  }
  const featureKey = params.featureKey;
  const dept = await prisma.department.findUnique({
    where: { id: params.departmentId },
    select: { id: true, tenantId: true, name: true, featureKeys: true },
  });
  if (!dept || dept.tenantId !== params.tenantId) throw new Error("Department not found");

  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  if (granted === "ALL" || granted.includes(featureKey)) {
    throw new Error("This department already has that feature");
  }
  const existing = await prisma.featureRequest.findFirst({
    where: { departmentId: dept.id, featureKey, status: "PENDING" },
    select: { id: true },
  });
  if (existing) throw new Error("A request for this feature is already pending");

  const request = await prisma.featureRequest.create({
    data: {
      tenantId: params.tenantId,
      departmentId: dept.id,
      featureKey,
      requestedById: params.requestedById,
      message: params.message?.trim() || null,
    },
  });

  const label = TEMPLATE_FEATURE_LABELS[featureKey];
  const superAdmins = await prisma.profile.findMany({
    where: { isSuperAdmin: true, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    superAdmins.map((admin) =>
      createNotification({
        recipientId: admin.id,
        actorId: params.requestedById,
        type: "feature_request_submitted",
        message: `${dept.name} requested ${label}.`,
      }),
    ),
  );

  return request;
}

export async function listPendingFeatureRequests(): Promise<PendingFeatureRequest[]> {
  const rows = await prisma.featureRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    include: {
      tenant: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });
  const requesterIds = [...new Set(rows.map((row) => row.requestedById))];
  const requesters = requesterIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const requesterById = new Map(requesters.map((row) => [row.id, row]));

  return rows.map((row) => ({
    id: row.id,
    featureKey: row.featureKey,
    featureLabel: isMarketplaceFeatureKey(row.featureKey)
      ? TEMPLATE_FEATURE_LABELS[row.featureKey]
      : row.featureKey,
    message: row.message,
    requestedAt: row.requestedAt.toISOString(),
    tenant: row.tenant,
    department: row.department,
    requester: requesterById.get(row.requestedById) ?? null,
  }));
}

export async function reviewFeatureRequest(params: {
  requestId: string;
  decision: Extract<FeatureRequestStatus, "APPROVED" | "REJECTED">;
  reviewedById: string;
  reviewNote?: string;
}) {
  const request = await prisma.featureRequest.findUnique({
    where: { id: params.requestId },
    include: { department: { select: { id: true, name: true } } },
  });
  if (!request) throw new Error("Request not found");
  if (request.status !== "PENDING") throw new Error("Request has already been reviewed");
  if (!isMarketplaceFeatureKey(request.featureKey)) {
    throw new Error("That isn't a feature you can approve");
  }
  if (params.decision === "REJECTED" && !params.reviewNote?.trim()) {
    throw new Error("A rejection reason is required");
  }

  const featureKey = request.featureKey;
  await prisma.$transaction(async (tx) => {
    await tx.featureRequest.update({
      where: { id: request.id },
      data: {
        status: params.decision,
        reviewedById: params.reviewedById,
        reviewedAt: new Date(),
        reviewNote: params.reviewNote?.trim() || null,
      },
    });
    if (params.decision === "APPROVED") {
      await grantDepartmentFeature(tx, request.departmentId, featureKey);
    }
  });

  await recordAuditEvent({
    tenantId: request.tenantId,
    departmentId: request.departmentId,
    actorId: params.reviewedById,
    action: params.decision === "APPROVED" ? "FEATURE_REQUEST_APPROVED" : "FEATURE_REQUEST_REJECTED",
    targetType: "FeatureRequest",
    targetId: request.id,
    after: { featureKey, reviewNote: params.reviewNote ?? null },
  });

  const label = TEMPLATE_FEATURE_LABELS[featureKey];
  const message =
    params.decision === "APPROVED"
      ? `${label} is now available in ${request.department.name}.`
      : `${label} was declined for ${request.department.name}.${params.reviewNote?.trim() ? ` ${params.reviewNote.trim()}` : ""}`;
  await createNotification({
    recipientId: request.requestedById,
    actorId: params.reviewedById,
    type: "feature_request_reviewed",
    message,
  });
}
