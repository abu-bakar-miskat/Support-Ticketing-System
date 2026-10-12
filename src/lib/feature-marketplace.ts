import { statusCategory } from "@/lib/status-category";
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { recordAuditEvent } from "@/lib/audit-log";
import { ensureAvailableFeatureTemplates, getDepartmentActiveFeatureKeys } from "@/lib/template-catalogue";
import { isSystemTemplateSlug } from "@/lib/system-templates";
import { applyOperationBoard } from "@/lib/operation-board";
import { type OperationTemplate } from "@/lib/operation-templates";
import { applyTemplateFeatureSetup, listSavedBoards, mergeBoard, resolveOperation } from "@/lib/saved-boards";
import { featureCopy, featureSetupSummary, plainFeatureRequestKey, scopedFeatureRequest, emptyFeatureSetup, savedFeatureToSetup, type SavedFeature } from "@/lib/feature-setup";
import { ensureDefaultFeatureTemplates, listSavedFeatures } from "@/lib/saved-features";
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
import type { MarketplaceBoard, MarketplaceFeature, MarketplaceTemplate, PendingFeatureRequest } from "@/lib/feature-marketplace-types";

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

function templateTokens(raw: unknown, exceptTemplateId?: string): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => {
    if (typeof value !== "string") return false;
    const id = templateIdFromGrantToken(value);
    return id !== null && id !== exceptTemplateId;
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
    data: { featureKeys: [...granted, key, ...templateTokens(dept.featureKeys)] },
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
      const requested = plainFeatureRequestKey(row.featureKey);
      const label = isMarketplaceFeatureKey(requested) ? TEMPLATE_FEATURE_LABELS[requested] : requested;
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
  if (owner) {
    await ensureAvailableFeatureTemplates(owner.id);
    await ensureDefaultFeatureTemplates(owner.id);
  }

  const { saved, order: operationOrder, features: savedFeatures } = await marketplaceBoardOrder();
  const [templates, pending] = await Promise.all([
    prisma.template.findMany({
      where: { isActive: true, slug: { in: [...operationOrder.keys()] } },
      include: { features: { select: { key: true } } },
    }),
    prisma.featureRequest.findMany({
      where: { departmentId, status: "PENDING" },
      select: { featureKey: true },
    }),
  ]);
  templates.sort(
    (a, b) => (operationOrder.get(a.slug) ?? 0) - (operationOrder.get(b.slug) ?? 0),
  );
  const pendingIds = new Set(
    pending.map((row) => templateIdFromGrantToken(row.featureKey)).filter((id): id is string => id !== null),
  );
  const pendingFeatureKeys = new Set<string>(
    pending.map((row) => plainFeatureRequestKey(row.featureKey)).filter(isMarketplaceFeatureKey),
  );
  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  const grantedKeys = new Set<string>(granted === "ALL" ? MARKETPLACE_FEATURE_KEYS : granted);

  return {
    departmentId: dept.id,
    departmentName: dept.name,
    templates: templates.map((template) => {
      const featureTemplate = savedFeatures.find((feature) => feature.id === template.slug);
      const operation = mergeBoard(template.slug, saved);
      const order = new Map<string, number>(
        (operation?.featureKeys ?? template.features.map((feature) => feature.key)).map((key, index) => [key, index]),
      );
      const templateToken = templateGrantToken(template.id);
      const hasThisTemplate = Array.isArray(dept.featureKeys) && dept.featureKeys.includes(templateToken);
      const templatePending = pending.some(
        (row) => row.featureKey === templateToken || scopedFeatureRequest(row.featureKey)?.templateId === template.id,
      );
      const features = [...template.features]
        .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
        .map((feature) => ({
          key: feature.key,
          label: isTemplateFeatureLabel(feature.key),
          status: (featureTemplate
            ? hasThisTemplate
              ? "enabled"
              : templatePending
                ? "pending"
                : "available"
            : grantedKeys.has(feature.key)
              ? "enabled"
              : pendingFeatureKeys.has(feature.key)
                ? "pending"
                : "available") as "enabled" | "pending" | "available",
          enabledFor: featureTemplate
            ? hasThisTemplate
              ? [departmentId]
              : []
            : grantedKeys.has(feature.key)
              ? [departmentId]
              : [],
          pendingFor: featureTemplate
            ? templatePending
              ? [departmentId]
              : []
            : pendingFeatureKeys.has(feature.key)
              ? [departmentId]
              : [],
        }));
      const allOn = features.length > 0 && features.every((feature) => feature.status === "enabled");
      return {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        features,
        status: allOn ? "enabled" : pendingIds.has(template.id) ? "pending" : "available",
        pendingFor: pendingIds.has(template.id) ? [departmentId] : [],
        board: savedFeatures.find((feature) => feature.id === template.slug)
          ? savedFeatureBoard(savedFeatures.find((feature) => feature.id === template.slug)!)
          : boardPayload(operation),
      };
    }),
  };
}

function isTemplateFeatureLabel(key: string): string {
  return (TEMPLATE_FEATURE_LABELS as Record<string, string>)[key] ?? key;
}

function boardPayload(operation: OperationTemplate | null): MarketplaceBoard | null {
  if (!operation) return null;
  const setup = operation.setup ?? emptyFeatureSetup();
  return {
    useCase: operation.useCase,
    group: operation.group?.trim() || "Operations",
    statuses: operation.statuses.map((status) => ({
      label: status.label,
      color: status.color,
      category: statusCategory(status),
      isComplete: statusCategory(status) === "COMPLETE",
    })),
    lists: operation.lists,
    featureDetails: operation.featureKeys.filter(isMarketplaceFeatureKey).map((key) => ({
      key,
      explanation: featureCopy(setup, key).explanation,
      summary: featureSetupSummary(key, setup, operation.statuses),
    })),
  };
}

function savedFeatureBoard(feature: SavedFeature): MarketplaceBoard {
  const group = MARKETPLACE_FEATURE_GROUPS.find((item) => item.keys.includes(feature.key))?.label ?? "Features";
  const setup = savedFeatureToSetup(feature);
  return {
    useCase: feature.useCase || feature.explanation,
    group,
    statuses: feature.statuses.map((status) => ({
      label: status.label,
      color: status.color,
      category: statusCategory(status),
      isComplete: statusCategory(status) === "COMPLETE",
    })),
    lists: feature.lists,
    featureDetails: [{
      key: feature.key,
      explanation: feature.explanation || featureCopy(setup, feature.key).explanation,
      summary: featureSetupSummary(feature.key, setup, feature.statuses),
    }],
  };
}

async function marketplaceBoardOrder() {
  const [saved, features] = await Promise.all([listSavedBoards(), listSavedFeatures()]);
  const order = new Map<string, number>();
  features.forEach((feature, index) => order.set(feature.id, index));
  return { saved, order, features };
}

/** Marketplace for the organization, with each feature's status per department. */
export async function listMarketplaceTemplatesForTenant(tenantId: string): Promise<{
  tenantId: string;
  tenantName: string;
  departments: { id: string; name: string }[];
  templates: MarketplaceTemplate[];
} | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) return null;

  const owner = await prisma.profile.findFirst({
    where: { isSuperAdmin: true, isActive: true },
    select: { id: true },
  });
  if (owner) {
    await ensureAvailableFeatureTemplates(owner.id);
    await ensureDefaultFeatureTemplates(owner.id);
  }

  const { saved, order: operationOrder, features: savedFeatures } = await marketplaceBoardOrder();
  const [templates, departments, pending] = await Promise.all([
    prisma.template.findMany({
      where: { isActive: true, slug: { in: [...operationOrder.keys()] } },
      include: { features: { select: { key: true } } },
    }),
    prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, featureKeys: true },
    }),
    prisma.featureRequest.findMany({
      where: { tenantId, status: "PENDING" },
      select: { departmentId: true, featureKey: true },
    }),
  ]);
  templates.sort(
    (a, b) => (operationOrder.get(a.slug) ?? 0) - (operationOrder.get(b.slug) ?? 0),
  );

  const grantedByDepartment = new Map(
    departments.map((department) => {
      const granted = grantedMarketplaceFeatures(department.featureKeys);
      return [
        department.id,
        new Set<string>(granted === "ALL" ? MARKETPLACE_FEATURE_KEYS : granted),
      ] as const;
    }),
  );

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    departments: departments.map((department) => ({ id: department.id, name: department.name })),
    templates: templates.map((template) => {
      const operation = mergeBoard(template.slug, saved);
      const order = new Map<string, number>(
        (operation?.featureKeys ?? template.features.map((feature) => feature.key)).map((key, index) => [key, index]),
      );
      const token = templateGrantToken(template.id);
      const pendingFor = [
        ...new Set(
          pending
            .filter((row) => row.featureKey === token)
            .map((row) => row.departmentId),
        ),
      ];
      const featureTemplate = savedFeatures.find((feature) => feature.id === template.slug);
      const features = [...template.features]
        .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
        .map((feature) => {
          const enabledFor = featureTemplate
            ? departments
                .filter((department) => Array.isArray(department.featureKeys) && department.featureKeys.includes(token))
                .map((department) => department.id)
            : departments
                .filter((department) => grantedByDepartment.get(department.id)?.has(feature.key))
                .map((department) => department.id);
          const featurePendingFor = [
            ...new Set(
              pending
                .filter((row) =>
                  featureTemplate
                    ? row.featureKey === token || scopedFeatureRequest(row.featureKey)?.templateId === template.id
                    : plainFeatureRequestKey(row.featureKey) === feature.key,
                )
                .map((row) => row.departmentId),
            ),
          ];
          const onEverywhere = departments.length > 0 && enabledFor.length === departments.length;
          return {
            key: feature.key,
            label: isTemplateFeatureLabel(feature.key),
            status: (onEverywhere ? "enabled" : featurePendingFor.length > 0 ? "pending" : "available") as
              | "enabled"
              | "pending"
              | "available",
            enabledFor,
            pendingFor: featurePendingFor,
          };
        });
      const allOn = features.length > 0 && features.every((feature) => feature.status === "enabled");
      return {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        features,
        status: allOn ? "enabled" : pendingFor.length > 0 ? "pending" : "available",
        pendingFor,
        board: savedFeatures.find((feature) => feature.id === template.slug)
          ? savedFeatureBoard(savedFeatures.find((feature) => feature.id === template.slug)!)
          : boardPayload(operation),
      };
    }),
  };
}

async function tenantDepartments(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error("Organization not found");
  const departments = await prisma.department.findMany({
    where: { tenantId },
    select: { id: true, featureKeys: true },
  });
  if (departments.length === 0) throw new Error("This organization has no departments yet");
  return { tenant, departments };
}

function departmentHasFeature(featureKeys: unknown, featureKey: MarketplaceFeatureKey): boolean {
  const granted = grantedMarketplaceFeatures(featureKeys);
  return granted === "ALL" || granted.includes(featureKey);
}

/** Super admin turns one operation feature on for every department in the organization. */
export async function enableTenantFeature(params: {
  tenantId: string;
  templateId: string;
  featureKey: string;
  actorId: string;
}) {
  const { departments } = await tenantDepartments(params.tenantId);
  if (!isMarketplaceFeatureKey(params.featureKey)) throw new Error("That isn't a feature you can change");
  const featureKey = params.featureKey;
  const missing = departments.filter((department) => !departmentHasFeature(department.featureKeys, featureKey));
  if (missing.length === 0) throw new Error("This organization already has that feature");
  for (const department of missing) {
    await enableDepartmentFeature({
      departmentId: department.id,
      templateId: params.templateId,
      featureKey,
      actorId: params.actorId,
    });
  }
}

/** Super admin turns one operation feature off for every department in the organization. */
export async function disableTenantFeature(params: {
  tenantId: string;
  templateId: string;
  featureKey: string;
  actorId: string;
}) {
  const { departments } = await tenantDepartments(params.tenantId);
  if (!isMarketplaceFeatureKey(params.featureKey)) throw new Error("That isn't a feature you can change");
  const featureKey = params.featureKey;
  const holding = departments.filter((department) => departmentHasFeature(department.featureKeys, featureKey));
  if (holding.length === 0) throw new Error("This organization does not have that feature");
  for (const department of holding) {
    await disableDepartmentFeature({
      departmentId: department.id,
      templateId: params.templateId,
      featureKey,
      actorId: params.actorId,
    });
  }
}

/** Super admin turns a whole operation on for every department that does not have it yet. */
export async function enableTenantTemplate(params: {
  tenantId: string;
  templateId: string;
  actorId: string;
}) {
  const { departments } = await tenantDepartments(params.tenantId);
  const missing = departments.filter((department) => !departmentHasTemplate(department.featureKeys, params.templateId));
  if (missing.length === 0) throw new Error("This organization already has that template");
  for (const department of missing) {
    await enableDepartmentTemplate({
      departmentId: department.id,
      templateId: params.templateId,
      actorId: params.actorId,
    });
  }
}

/** Super admin turns a whole operation off wherever a department still has it. */
export async function disableTenantTemplate(params: {
  tenantId: string;
  templateId: string;
  actorId: string;
}) {
  const { departments } = await tenantDepartments(params.tenantId);
  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    select: { features: { select: { key: true } } },
  });
  const keys = template?.features.map((feature) => feature.key) ?? [];
  const holding = [];
  for (const department of departments) {
    const active = await getDepartmentActiveFeatureKeys(department.id);
    if (departmentHasTemplate(department.featureKeys, params.templateId) || packageAlreadyEnabled(active, keys)) {
      holding.push(department);
    }
  }
  if (holding.length === 0) throw new Error("This organization does not have that template");
  for (const department of holding) {
    await disableDepartmentTemplate({
      departmentId: department.id,
      templateId: params.templateId,
      actorId: params.actorId,
    });
  }
}

async function notifyTenantFeatureRequest(params: {
  tenantName: string;
  label: string;
  requestedById: string;
}) {
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
        message: `${params.tenantName} requested approval to enable ${params.label} for the organization.`,
      }),
    ),
  );
}

/** Ask for one feature on every department in the organization that does not have it. */
export async function requestTenantFeature(params: {
  tenantId: string;
  featureKey: string;
  requestedById: string;
  message?: string;
}) {
  if (!isMarketplaceFeatureKey(params.featureKey)) throw new Error("That isn't a feature you can request");
  const featureKey = params.featureKey;
  const { tenant, departments } = await tenantDepartments(params.tenantId);
  const missing = departments.filter((department) => !departmentHasFeature(department.featureKeys, featureKey));
  if (missing.length === 0) throw new Error("This organization already has that feature");
  const pending = await prisma.featureRequest.findMany({
    where: { tenantId: params.tenantId, featureKey, status: "PENDING" },
    select: { departmentId: true },
  });
  const pendingIds = new Set(pending.map((row) => row.departmentId));
  const targets = missing.filter((department) => !pendingIds.has(department.id));
  if (targets.length === 0) throw new Error("A request for this feature is already pending");
  await prisma.featureRequest.createMany({
    data: targets.map((department) => ({
      tenantId: params.tenantId,
      departmentId: department.id,
      featureKey,
      requestedById: params.requestedById,
      message: params.message?.trim() || null,
    })),
  });
  await notifyTenantFeatureRequest({
    tenantName: tenant.name,
    label: TEMPLATE_FEATURE_LABELS[featureKey],
    requestedById: params.requestedById,
  });
}

/** Ask for a whole operation on every department that does not have it yet. */
export async function requestTenantTemplate(params: {
  tenantId: string;
  templateId: string;
  requestedById: string;
  message?: string;
}) {
  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!template || !template.isActive || isSystemTemplateSlug(template.slug)) {
    throw new Error("That template isn't available");
  }
  const { tenant, departments } = await tenantDepartments(params.tenantId);
  const token = templateGrantToken(template.id);
  const missing = departments.filter((department) => !departmentHasTemplate(department.featureKeys, template.id));
  if (missing.length === 0) throw new Error("This organization already has that template");
  const pending = await prisma.featureRequest.findMany({
    where: { tenantId: params.tenantId, featureKey: token, status: "PENDING" },
    select: { departmentId: true },
  });
  const pendingIds = new Set(pending.map((row) => row.departmentId));
  const targets = missing.filter((department) => !pendingIds.has(department.id));
  if (targets.length === 0) throw new Error("A request for this template is already pending");
  await prisma.featureRequest.createMany({
    data: targets.map((department) => ({
      tenantId: params.tenantId,
      departmentId: department.id,
      featureKey: token,
      requestedById: params.requestedById,
      message: params.message?.trim() || null,
    })),
  });
  await notifyTenantFeatureRequest({
    tenantName: tenant.name,
    label: template.name,
    requestedById: params.requestedById,
  });
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
  const featureTemplate = (await listSavedFeatures()).some((feature) => feature.id === template.slug);
  const active = await getDepartmentActiveFeatureKeys(dept.id);
  if (
    departmentHasTemplate(dept.featureKeys, template.id) ||
    (!featureTemplate &&
      packageAlreadyEnabled(
        active,
        template.features.map((feature) => feature.key),
      ))
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
  const operation = await resolveOperation(template.slug);
  const featureTemplate = (await listSavedFeatures()).find((feature) => feature.id === template.slug);
  const active = await getDepartmentActiveFeatureKeys(dept.id);
  const alreadyGranted = departmentHasTemplate(dept.featureKeys, template.id);
  if (alreadyGranted || (!operation && !featureTemplate && packageAlreadyEnabled(active, keys))) {
    throw new Error("This department already has that template");
  }

  const token = templateGrantToken(template.id);
  const pending = await prisma.featureRequest.findMany({
    where: { departmentId: dept.id, featureKey: token, status: "PENDING" },
    select: { id: true, requestedById: true },
  });

  await prisma.$transaction(async (tx) => {
    await grantDepartmentTemplate(tx, dept.id, template.id, keys);
    if (operation || featureTemplate) await applyOperationBoard(tx, dept.id, template.slug);
    if (operation || featureTemplate) {
      await applyTemplateFeatureSetup(tx, {
        departmentId: dept.id,
        tenantId: dept.tenantId,
        actorId: params.actorId,
        slug: template.slug,
        featureKeys: keys,
      });
    }
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

async function operationFeatureTemplate(templateId: string, featureKey: string) {
  if (!isMarketplaceFeatureKey(featureKey)) throw new Error("That isn't a feature you can change");
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, slug: true, isActive: true, features: { select: { key: true } } },
  });
  if (!template || !template.isActive || isSystemTemplateSlug(template.slug)) {
    throw new Error("That template isn't available");
  }
  if (!template.features.some((feature) => feature.key === featureKey)) {
    throw new Error("That feature isn't part of this operation");
  }
  return { template, featureKey };
}

/** Super admin turns one feature of an operation on for a department. */
export async function enableDepartmentFeature(params: {
  departmentId: string;
  templateId: string;
  featureKey: string;
  actorId: string;
}) {
  const { template, featureKey } = await operationFeatureTemplate(params.templateId, params.featureKey);
  const dept = await prisma.department.findUnique({
    where: { id: params.departmentId },
    select: { id: true, tenantId: true, name: true, featureKeys: true },
  });
  if (!dept) throw new Error("Department not found");

  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  const operation = await resolveOperation(template.slug);
  const featureTemplate = (await listSavedFeatures()).find((feature) => feature.id === template.slug);
  const applyBoard = (operation != null && featureKey === "board") || featureTemplate != null;
  if ((granted === "ALL" || granted.includes(featureKey)) && !featureTemplate) {
    throw new Error("This department already has that feature");
  }
  const pending = await prisma.featureRequest.findMany({
    where: {
      departmentId: dept.id,
      status: "PENDING",
      OR: [{ featureKey }, { featureKey: `feature:${featureKey}:${template.id}` }],
    },
    select: { id: true, requestedById: true },
  });

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.department.findUnique({
      where: { id: dept.id },
      select: { featureKeys: true },
    });
    if (!fresh) throw new Error("Department not found");
    const current = explicitMarketplaceKeys(fresh.featureKeys);
    const nextFeatures = MARKETPLACE_FEATURE_KEYS.filter((key) => current.includes(key) || key === featureKey);
    const tokens = templateTokens(fresh.featureKeys);
    const token = templateGrantToken(template.id);
    const nextTokens = applyBoard && !tokens.includes(token) ? [...tokens, token] : tokens;
    await tx.department.update({
      where: { id: dept.id },
      data: { featureKeys: [...nextFeatures, ...nextTokens] },
    });
    if (applyBoard) await applyOperationBoard(tx, dept.id, template.slug);
    if (operation || featureTemplate) {
      await applyTemplateFeatureSetup(tx, {
        departmentId: dept.id,
        tenantId: dept.tenantId,
        actorId: params.actorId,
        slug: template.slug,
        featureKeys: [featureKey],
      });
    }
    if (pending.length > 0) {
      await tx.featureRequest.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: { status: "APPROVED", reviewedById: params.actorId, reviewedAt: new Date() },
      });
    }
  });

  const label = TEMPLATE_FEATURE_LABELS[featureKey];
  await recordAuditEvent({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    actorId: params.actorId,
    action: "FEATURE_ENABLED",
    targetType: "Template",
    targetId: template.id,
    after: { departmentId: dept.id, departmentName: dept.name, featureKey, templateName: template.name },
  });

  const message = `Approved: ${label} is now available in ${dept.name}.`;
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

/** Super admin turns one feature of an operation off for a department. */
export async function disableDepartmentFeature(params: {
  departmentId: string;
  templateId: string;
  featureKey: string;
  actorId: string;
}) {
  const { template, featureKey } = await operationFeatureTemplate(params.templateId, params.featureKey);
  const dept = await prisma.department.findUnique({
    where: { id: params.departmentId },
    select: { id: true, tenantId: true, name: true, featureKeys: true },
  });
  if (!dept) throw new Error("Department not found");

  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  if (granted !== "ALL" && !granted.includes(featureKey)) {
    throw new Error("This department does not have that feature");
  }

  const operation = await resolveOperation(template.slug);
  const dropBoard = operation != null && featureKey === "board";

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.department.findUnique({
      where: { id: dept.id },
      select: { featureKeys: true },
    });
    if (!fresh) throw new Error("Department not found");
    const nextFeatures = explicitMarketplaceKeys(fresh.featureKeys).filter((key) => key !== featureKey);
    const tokens = templateTokens(fresh.featureKeys, dropBoard ? template.id : undefined);
    await tx.department.update({
      where: { id: dept.id },
      data: { featureKeys: [...nextFeatures, ...tokens] },
    });
  });

  const label = TEMPLATE_FEATURE_LABELS[featureKey];
  await recordAuditEvent({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    actorId: params.actorId,
    action: "FEATURE_DISABLED",
    targetType: "Template",
    targetId: template.id,
    after: { departmentId: dept.id, departmentName: dept.name, featureKey, templateName: template.name },
  });

  await notifyDepartmentFeatureReview({
    tenantId: dept.tenantId,
    departmentId: dept.id,
    requesterId: params.actorId,
    actorId: params.actorId,
    message: `Disabled: ${label} is no longer available in ${dept.name}.`,
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
  const pendingKeys = new Set(pending.map((row) => plainFeatureRequestKey(row.featureKey)));
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
  templateId?: string;
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

  const source = params.templateId
    ? await prisma.template.findUnique({
        where: { id: params.templateId },
        select: { slug: true, isActive: true },
      })
    : null;
  const featureTemplate =
    source?.isActive === true && (await listSavedFeatures()).some((feature) => feature.id === source.slug);
  const granted = grantedMarketplaceFeatures(dept.featureKeys);
  if (featureTemplate && params.templateId && departmentHasTemplate(dept.featureKeys, params.templateId)) {
    throw new Error("This department already has that template");
  }
  if (!featureTemplate && (granted === "ALL" || granted.includes(featureKey))) {
    throw new Error("This department already has that feature");
  }
  const storedKey = params.templateId ? `feature:${featureKey}:${params.templateId}` : featureKey;
  const existing = await prisma.featureRequest.findFirst({
    where: featureTemplate
      ? { departmentId: dept.id, status: "PENDING", featureKey: storedKey }
      : {
          departmentId: dept.id,
          status: "PENDING",
          OR: [{ featureKey }, { featureKey: { startsWith: `feature:${featureKey}:` } }],
        },
    select: { id: true },
  });
  if (existing) throw new Error("A request for this feature is already pending");

  const request = await prisma.featureRequest.create({
    data: {
      tenantId: params.tenantId,
      departmentId: dept.id,
      featureKey: storedKey,
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
    const requestedKey = plainFeatureRequestKey(row.featureKey);
    const template = templateById.get(templateIdFromGrantToken(row.featureKey) ?? "");
    const featureLabel = template
      ? template.name
      : isMarketplaceFeatureKey(requestedKey)
        ? TEMPLATE_FEATURE_LABELS[requestedKey]
        : requestedKey;
    const narrative = featureTemplateNarrative({
      description: template?.description ?? null,
      features: template
        ? template.features.map((feature) => ({
            key: feature.key,
            label: isTemplateFeatureLabel(feature.key),
          }))
        : [{ key: requestedKey, label: featureLabel }],
    });
    const featureDescription =
      narrative.useCases.map((item) => item.text).join(" ") ||
      narrative.customDescription ||
      narrative.included.map((item) => item.explanation).filter((text): text is string => !!text).join(" ") ||
      null;
    const featureKeys = template
      ? template.features.map((feature) => feature.key)
      : [requestedKey];
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
  const requestedFeatureKey = plainFeatureRequestKey(request.featureKey);
  if (!templateId && !isMarketplaceFeatureKey(requestedFeatureKey)) {
    throw new Error("That isn't a feature you can approve");
  }
  if (params.decision === "REJECTED" && !params.reviewNote?.trim()) {
    throw new Error("A rejection reason is required");
  }

  const featureKey = request.featureKey;
  const template = templateId
    ? await prisma.template.findUnique({
        where: { id: templateId },
        select: { id: true, name: true, slug: true, features: { select: { key: true } } },
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
      if ((await resolveOperation(template.slug)) || (await listSavedFeatures()).some((feature) => feature.id === template.slug)) {
        await applyOperationBoard(tx, request.departmentId, template.slug);
        await applyTemplateFeatureSetup(tx, {
          departmentId: request.departmentId,
          tenantId: request.tenantId,
          actorId: params.reviewedById,
          slug: template.slug,
          featureKeys: keys,
        });
      }
    } else if (params.decision === "APPROVED" && isMarketplaceFeatureKey(requestedFeatureKey)) {
      await grantDepartmentFeature(tx, request.departmentId, requestedFeatureKey);
      const scoped = scopedFeatureRequest(featureKey);
      if (scoped) {
        const source = await tx.template.findUnique({
          where: { id: scoped.templateId },
          select: { slug: true },
        });
        if (source) {
          if (requestedFeatureKey === "board") await applyOperationBoard(tx, request.departmentId, source.slug);
          await applyTemplateFeatureSetup(tx, {
            departmentId: request.departmentId,
            tenantId: request.tenantId,
            actorId: params.reviewedById,
            slug: source.slug,
            featureKeys: [requestedFeatureKey],
          });
        }
      }
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
