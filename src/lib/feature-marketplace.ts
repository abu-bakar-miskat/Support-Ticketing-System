import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { recordAuditEvent } from "@/lib/audit-log";
import { ensureAvailableFeatureTemplates, getDepartmentActiveFeatureKeys } from "@/lib/template-catalogue";
import { isSystemTemplateSlug, SYSTEM_TEMPLATES } from "@/lib/system-templates";
import { createNotification } from "@/lib/notify";
import {
  MARKETPLACE_FEATURE_DESCRIPTIONS,
  MARKETPLACE_FEATURE_GROUPS,
  MARKETPLACE_FEATURE_KEYS,
  TEMPLATE_FEATURE_LABELS,
  featureTemplateNarrative,
  grantedMarketplaceFeatures,
  isMarketplaceFeatureKey,
  templateGrantToken,
  templateIdFromGrantToken,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
import type { FeatureRequestStatus } from "@/generated/prisma/enums";
import type { MarketplaceFeature, MarketplaceTemplate, PendingFeatureRequest } from "@/lib/feature-marketplace-types";

export type { MarketplaceFeature, MarketplaceTemplate, PendingFeatureRequest };

async function grantDepartmentTemplate(
  tx: Prisma.TransactionClient,
  departmentId: string,
  templateId: string,
  keys: MarketplaceFeatureKey[],
) {
  const dept = await tx.department.findUnique({
    where: { id: departmentId },
    select: { featureKeys: true },
  });
  if (!dept) throw new Error("Department not found");
  const token = templateGrantToken(templateId);
  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  const current = granted === "ALL" ? [...MARKETPLACE_FEATURE_KEYS] : granted;
  const nextFeatures = MARKETPLACE_FEATURE_KEYS.filter((key) => current.includes(key) || keys.includes(key));
  const extras = Array.isArray(dept.featureKeys)
    ? dept.featureKeys.filter((value): value is string => typeof value === "string" && templateIdFromGrantToken(value) !== null && value !== token)
    : [];
  await tx.department.update({
    where: { id: departmentId },
    data: { featureKeys: [...nextFeatures, ...extras, token] },
  });
}

async function revokeDepartmentTemplate(
  tx: Prisma.TransactionClient,
  departmentId: string,
  templateId: string,
  keys: MarketplaceFeatureKey[],
) {
  const dept = await tx.department.findUnique({
    where: { id: departmentId },
    select: { featureKeys: true },
  });
  if (!dept) throw new Error("Department not found");
  const token = templateGrantToken(templateId);
  const current = explicitMarketplaceKeys(dept.featureKeys);
  const otherTokens = Array.isArray(dept.featureKeys)
    ? dept.featureKeys.filter(
        (value): value is string =>
          typeof value === "string" && templateIdFromGrantToken(value) !== null && value !== token,
      )
    : [];
  const otherIds = otherTokens
    .map(templateIdFromGrantToken)
    .filter((id): id is string => id !== null);
  const keptByOthers = new Set<MarketplaceFeatureKey>();
  if (otherIds.length > 0) {
    const rows = await tx.templateFeature.findMany({
      where: { templateId: { in: otherIds } },
      select: { key: true },
    });
    for (const row of rows) {
      if (isMarketplaceFeatureKey(row.key)) keptByOthers.add(row.key);
    }
  }
  const remove = new Set(keys);
  const nextFeatures = current.filter((key) => !remove.has(key) || keptByOthers.has(key));
  await tx.department.update({
    where: { id: departmentId },
    data: { featureKeys: [...nextFeatures, ...otherTokens] },
  });
}

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
        select: {
          id: true,
          featureKey: true,
          departmentId: true,
          requestedById: true,
          department: { select: { name: true } },
        },
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
      return notifyDepartmentFeatureReview({
        tenantId: params.tenantId,
        departmentId: row.departmentId,
        requesterId: row.requestedById,
        actorId: params.actorId,
        message: `Approved: ${label} is now available in ${row.department.name}.`,
      });
    }),
  );

  return listTenantDepartmentFeatures(params.tenantId);
}

function departmentHasTemplate(featureKeys: unknown, templateId: string): boolean {
  if (featureKeys == null) return true;
  if (!Array.isArray(featureKeys)) return false;
  return featureKeys.includes(templateGrantToken(templateId));
}

/** True when every marketplace feature in the package is already on for this department. */
function packageAlreadyEnabled(
  active: Awaited<ReturnType<typeof getDepartmentActiveFeatureKeys>>,
  featureKeys: string[],
): boolean {
  if (active === "ALL") return true;
  const required = featureKeys.filter(isMarketplaceFeatureKey);
  return required.length > 0 && required.every((key) => active.has(key));
}

/** Active feature templates, and whether this department already has each one. */
export async function listMarketplaceTemplates(departmentId: string): Promise<{
  departmentId: string;
  departmentName: string;
  templates: MarketplaceTemplate[];
} | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, featureKeys: true },
  });
  if (!dept) return null;

  const owner = await prisma.profile.findFirst({
    where: { isSuperAdmin: true, isActive: true },
    select: { id: true },
  });
  if (owner) await ensureAvailableFeatureTemplates(owner.id);

  const [templates, pending] = await Promise.all([
    prisma.template.findMany({
      // Support is the old whole-tenant template. Marketplace templates are
      // pre-built feature packages a department can request.
      where: { isActive: true, slug: { notIn: SYSTEM_TEMPLATES.map((template) => template.slug) } },
      orderBy: { order: "asc" },
      include: { features: { select: { key: true } } },
    }),
    prisma.featureRequest.findMany({
      where: { departmentId, status: "PENDING" },
      select: { featureKey: true },
    }),
  ]);
  const pendingIds = new Set(
    pending.map((row) => templateIdFromGrantToken(row.featureKey)).filter((id): id is string => id !== null),
  );
  const active = await getDepartmentActiveFeatureKeys(departmentId);

  return {
    departmentId: dept.id,
    departmentName: dept.name,
    templates: templates.map((template) => {
      const featureKeys = template.features.map((feature) => feature.key);
      const enabled =
        departmentHasTemplate(dept.featureKeys, template.id) || packageAlreadyEnabled(active, featureKeys);
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        features: template.features.map((feature) => ({
          key: feature.key,
          label: isTemplateFeatureLabel(feature.key),
        })),
        status: enabled ? "enabled" : pendingIds.has(template.id) ? "pending" : "available",
      };
    }),
  };
}

function isTemplateFeatureLabel(key: string): string {
  return (TEMPLATE_FEATURE_LABELS as Record<string, string>)[key] ?? key;
}

export async function requestDepartmentTemplate(params: {
  tenantId: string;
  departmentId: string;
  templateId: string;
  requestedById: string;
  message?: string;
}) {
  const [template, dept] = await Promise.all([
    prisma.template.findUnique({
      where: { id: params.templateId },
      select: { id: true, name: true, slug: true, isActive: true, features: { select: { key: true } } },
    }),
    prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, tenantId: true, name: true, featureKeys: true, tenant: { select: { name: true } } },
    }),
  ]);
  if (!template || !template.isActive || isSystemTemplateSlug(template.slug)) {
    throw new Error("That template isn't available");
  }
  if (!dept || dept.tenantId !== params.tenantId) throw new Error("Department not found");
  const active = await getDepartmentActiveFeatureKeys(dept.id);
  if (
    departmentHasTemplate(dept.featureKeys, template.id) ||
    packageAlreadyEnabled(
      active,
      template.features.map((feature) => feature.key),
    )
  ) {
    throw new Error("This department already has that template");
  }
  const token = templateGrantToken(template.id);
  const existing = await prisma.featureRequest.findFirst({
    where: { departmentId: dept.id, featureKey: token, status: "PENDING" },
    select: { id: true },
  });
  if (existing) throw new Error("A request for this template is already pending");

  const request = await prisma.featureRequest.create({
    data: {
      tenantId: params.tenantId,
      departmentId: dept.id,
      featureKey: token,
      requestedById: params.requestedById,
      message: params.message?.trim() || null,
    },
  });

  const superAdmins = await runAsSystem(() =>
    prisma.profile.findMany({
      where: { isSuperAdmin: true, isActive: true },
      select: { id: true },
    }),
  );
  await Promise.all(
    superAdmins.map((admin) =>
      createNotification({
        recipientId: admin.id,
        actorId: params.requestedById,
        type: "feature_request_submitted",
        message: `${dept.tenant.name} requested approval to enable ${template.name} for ${dept.name}.`,
      }),
    ),
  );

  return request;
}

/** Super admin turns a feature template on for one department, without a request. */
export async function enableDepartmentTemplate(params: {
  departmentId: string;
  templateId: string;
  actorId: string;
}) {
  const [template, dept] = await Promise.all([
    prisma.template.findUnique({
      where: { id: params.templateId },
      select: { id: true, name: true, slug: true, isActive: true, features: { select: { key: true } } },
    }),
    prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, tenantId: true, name: true, featureKeys: true },
    }),
  ]);
  if (!template || !template.isActive || isSystemTemplateSlug(template.slug)) {
    throw new Error("That template isn't available");
  }
  if (!dept) throw new Error("Department not found");

  const keys = template.features.map((feature) => feature.key).filter(isMarketplaceFeatureKey);
  const active = await getDepartmentActiveFeatureKeys(dept.id);
  if (departmentHasTemplate(dept.featureKeys, template.id) || packageAlreadyEnabled(active, keys)) {
    throw new Error("This department already has that template");
  }

  const token = templateGrantToken(template.id);
  const pending = await prisma.featureRequest.findMany({
    where: { departmentId: dept.id, featureKey: token, status: "PENDING" },
    select: { id: true, requestedById: true },
  });

  await prisma.$transaction(async (tx) => {
    await grantDepartmentTemplate(tx, dept.id, template.id, keys);
    if (pending.length > 0) {
      await tx.featureRequest.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: {
          status: "APPROVED",
          reviewedById: params.actorId,
          reviewedAt: new Date(),
        },
      });
    }
  });

  await recordAuditEvent({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    actorId: params.actorId,
    action: "FEATURE_TEMPLATE_ENABLED",
    targetType: "Template",
    targetId: template.id,
    after: { departmentId: dept.id, departmentName: dept.name, featureKeys: keys, templateName: template.name },
  });

  const message = `Approved: ${template.name} is now available in ${dept.name}.`;
  const requesterIds = pending.length > 0 ? pending.map((row) => row.requestedById) : [params.actorId];
  await Promise.all(
    requesterIds.map((requesterId) =>
      notifyDepartmentFeatureReview({
        tenantId: dept.tenantId,
        departmentId: dept.id,
        requesterId,
        actorId: params.actorId,
        message,
      }),
    ),
  );
}

/** Super admin turns a feature template off for one department. */
export async function disableDepartmentTemplate(params: {
  departmentId: string;
  templateId: string;
  actorId: string;
}) {
  const [template, dept] = await Promise.all([
    prisma.template.findUnique({
      where: { id: params.templateId },
      select: { id: true, name: true, slug: true, isActive: true, features: { select: { key: true } } },
    }),
    prisma.department.findUnique({
      where: { id: params.departmentId },
      select: { id: true, tenantId: true, name: true, featureKeys: true },
    }),
  ]);
  if (!template || !template.isActive || isSystemTemplateSlug(template.slug)) {
    throw new Error("That template isn't available");
  }
  if (!dept) throw new Error("Department not found");

  const keys = template.features.map((feature) => feature.key).filter(isMarketplaceFeatureKey);
  const active = await getDepartmentActiveFeatureKeys(dept.id);
  if (!departmentHasTemplate(dept.featureKeys, template.id) && !packageAlreadyEnabled(active, keys)) {
    throw new Error("This department does not have that template");
  }

  await prisma.$transaction(async (tx) => {
    await revokeDepartmentTemplate(tx, dept.id, template.id, keys);
  });

  await recordAuditEvent({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    actorId: params.actorId,
    action: "FEATURE_TEMPLATE_DISABLED",
    targetType: "Template",
    targetId: template.id,
    after: { departmentId: dept.id, departmentName: dept.name, featureKeys: keys, templateName: template.name },
  });

  await notifyDepartmentFeatureReview({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    requesterId: params.actorId,
    actorId: params.actorId,
    message: `Disabled: ${template.name} is no longer available in ${dept.name}.`,
  });
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
    select: { id: true, tenantId: true, name: true, featureKeys: true, tenant: { select: { name: true } } },
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
  const superAdmins = await runAsSystem(() =>
    prisma.profile.findMany({
      where: { isSuperAdmin: true, isActive: true },
      select: { id: true },
    }),
  );
  await Promise.all(
    superAdmins.map((admin) =>
      createNotification({
        recipientId: admin.id,
        actorId: params.requestedById,
        type: "feature_request_submitted",
        message: `${dept.tenant.name} requested approval to enable ${label} for ${dept.name}.`,
      }),
    ),
  );

  return request;
}

export async function countPendingFeatureRequests(): Promise<number> {
  return prisma.featureRequest.count({ where: { status: "PENDING" } });
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
  const templateIds = [
    ...new Set(rows.map((row) => templateIdFromGrantToken(row.featureKey)).filter((id): id is string => id !== null)),
  ];
  const [requesters, templates] = await Promise.all([
    requesterIds.length
      ? prisma.profile.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    templateIds.length
      ? prisma.template.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, name: true, description: true, features: { select: { key: true } } },
        })
      : Promise.resolve([]),
  ]);
  const requesterById = new Map(requesters.map((row) => [row.id, row]));
  const templateById = new Map(templates.map((row) => [row.id, row]));

  return rows.map((row) => {
    const template = templateById.get(templateIdFromGrantToken(row.featureKey) ?? "");
    const featureLabel = template
      ? template.name
      : isMarketplaceFeatureKey(row.featureKey)
        ? TEMPLATE_FEATURE_LABELS[row.featureKey]
        : row.featureKey;
    const narrative = featureTemplateNarrative({
      description: template?.description ?? null,
      features: template
        ? template.features.map((feature) => ({
            key: feature.key,
            label: isTemplateFeatureLabel(feature.key),
          }))
        : [{ key: row.featureKey, label: featureLabel }],
    });
    const featureDescription =
      narrative.useCases.map((item) => item.text).join(" ") ||
      narrative.customDescription ||
      narrative.included.map((item) => item.explanation).filter((text): text is string => !!text).join(" ") ||
      null;
    const featureKeys = template
      ? template.features.map((feature) => feature.key)
      : [row.featureKey];
    return {
    id: row.id,
    featureKey: row.featureKey,
    featureKeys,
    featureLabel,
    featureDescription,
    message: row.message,
    requestedAt: row.requestedAt.toISOString(),
    tenant: row.tenant,
    department: row.department,
    requester: requesterById.get(row.requestedById) ?? null,
  };
  });
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
  const templateId = templateIdFromGrantToken(request.featureKey);
  if (!templateId && !isMarketplaceFeatureKey(request.featureKey)) {
    throw new Error("That isn't a feature you can approve");
  }
  if (params.decision === "REJECTED" && !params.reviewNote?.trim()) {
    throw new Error("A rejection reason is required");
  }

  const featureKey = request.featureKey;
  const template = templateId
    ? await prisma.template.findUnique({
        where: { id: templateId },
        select: { id: true, name: true, features: { select: { key: true } } },
      })
    : null;
  if (templateId && !template) throw new Error("That template no longer exists");

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
    if (params.decision === "APPROVED" && template) {
      const keys = template.features.map((feature) => feature.key).filter(isMarketplaceFeatureKey);
      await grantDepartmentTemplate(tx, request.departmentId, template.id, keys);
    } else if (params.decision === "APPROVED" && isMarketplaceFeatureKey(featureKey)) {
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
    after: {
      featureKey,
      templateName: template?.name ?? null,
      departmentName: request.department.name,
      reviewNote: params.reviewNote ?? null,
    },
  });

  const label = template
    ? template.name
    : isMarketplaceFeatureKey(featureKey)
      ? TEMPLATE_FEATURE_LABELS[featureKey]
      : featureKey;
  const message =
    params.decision === "APPROVED"
      ? `Approved: ${label} is now available in ${request.department.name}.`
      : `Rejected: ${label} was declined for ${request.department.name}.${params.reviewNote?.trim() ? ` ${params.reviewNote.trim()}` : ""}`;
  await notifyDepartmentFeatureReview({
    tenantId: request.tenantId,
    departmentId: request.departmentId,
    requesterId: request.requestedById,
    actorId: params.reviewedById,
    message,
  });
}

/** Requester, department managers, and tenant admins hear the outcome. */
async function notifyDepartmentFeatureReview(params: {
  tenantId: string;
  departmentId: string;
  requesterId: string;
  actorId: string;
  message: string;
}) {
  const [managers, admins] = await Promise.all([
    prisma.departmentManager.findMany({
      where: { departmentId: params.departmentId },
      select: { userId: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId: params.tenantId, role: "admin", isActive: true },
      select: { userId: true },
    }),
  ]);
  const recipientIds = new Set<string>([
    params.requesterId,
    ...managers.map((row) => row.userId),
    ...admins.map((row) => row.userId),
  ]);
  await Promise.all(
    [...recipientIds].map((recipientId) =>
      createNotification({
        recipientId,
        actorId: params.actorId,
        type: "feature_request_reviewed",
        message: params.message,
      }),
    ),
  );
}
