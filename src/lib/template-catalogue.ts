import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { recordAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/lib/notify";
import {
  ALWAYS_ON_FEATURE_KEYS,
  TEMPLATE_FEATURE_KEYS,
  grantedMarketplaceFeatures,
  isMarketplaceFeatureKey,
  templateIdFromGrantToken,
  type TemplateFeatureKey,
} from "@/lib/template-features";
import { AVAILABLE_FEATURE_TEMPLATES, SYSTEM_TEMPLATES } from "@/lib/system-templates";
import { templateRequestReviewedMessage } from "@/lib/template-request-messages";
import type { TemplateRequestStatus } from "@/generated/prisma/enums";

/**
 * Effective feature keys for a department — its Super-Admin-controllable
 * allowlist (Department.featureKeys), seeded from its template at creation and
 * editable via the per-department features API. Drives per-department settings
 * and sidebar gating (and thus its sub-departments), unlike
 * getTenantActiveFeatureKeys which is tenant-wide.
 *
 * `null` featureKeys = legacy department → "ALL" (marketplace features included).
 * An array grants only the marketplace keys it lists. Everything else
 * (tasks, board, members, …) stays on. An empty array — what a new
 * department is created with — means none of the marketplace features.
 * Resilient to the column not existing yet: fails open to "ALL".
 */
export async function getDepartmentActiveFeatureKeys(
  departmentId: string,
): Promise<Set<TemplateFeatureKey> | "ALL"> {
  // Explicit departmentId — read unscoped so layout callers don't trigger
  // the per-query scope waterfall on the shared pooler.
  const dept = await runAsSystem(() =>
    prisma.department.findUnique({ where: { id: departmentId }, select: { featureKeys: true } }),
  ).catch(() => null);

  const granted = grantedMarketplaceFeatures(dept?.featureKeys);
  if (granted === "ALL") return "ALL";

  const templateIds = Array.isArray(dept?.featureKeys)
    ? dept.featureKeys.map(templateIdFromGrantToken).filter((id): id is string => id !== null)
    : [];
  const fromTemplates = templateIds.length
    ? await runAsSystem(() =>
        prisma.templateFeature.findMany({
          where: { templateId: { in: templateIds } },
          select: { key: true },
        }),
      ).catch(() => [])
    : [];

  return new Set<TemplateFeatureKey>([
    ...ALWAYS_ON_FEATURE_KEYS,
    ...granted,
    ...fromTemplates.map((row) => row.key).filter(isMarketplaceFeatureKey),
  ]);
}

/**
 * Template Catalogue feature gating. Fail-open by design, same rationale as
 * FeatureFlag (lib/feature-flags.ts): a tenant with zero TenantTemplate rows
 * has every template-gated feature visible — the gate only takes effect once
 * a tenant has adopted at least one ACTIVE template, so shipping this needs
 * no backfill across existing tenants.
 */
export async function getTenantActiveFeatureKeys(
  tenantId: string,
): Promise<Set<TemplateFeatureKey> | "ALL"> {
  const grants = await runAsSystem(() =>
    prisma.tenantTemplate.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { template: { select: { features: { select: { key: true } } } } },
    }),
  );
  if (grants.length === 0) return "ALL";

  const keys = new Set<TemplateFeatureKey>();
  for (const grant of grants) {
    for (const feature of grant.template.features) {
      if ((TEMPLATE_FEATURE_KEYS as readonly string[]).includes(feature.key)) {
        keys.add(feature.key as TemplateFeatureKey);
      }
    }
  }
  return keys;
}

export async function hasTemplateFeature(tenantId: string, key: TemplateFeatureKey): Promise<boolean> {
  const keys = await getTenantActiveFeatureKeys(tenantId);
  return keys === "ALL" || keys.has(key);
}

/**
 * Effective features for the sidebar, settings nav, and route guard.
 *
 * No active department → the tenant's template set (or everything).
 * A legacy department (`featureKeys` null) keeps that same set.
 * A department with an explicit grant list uses always-on features plus the
 * marketplace features a super admin has approved. Approval is enough — a
 * granted feature is not stripped because a template omitted it.
 */
export async function getEffectiveFeatureKeys(
  tenantId: string | null | undefined,
  departmentId: string | null | undefined,
): Promise<Set<TemplateFeatureKey> | "ALL"> {
  const tenantSet = tenantId ? await getTenantActiveFeatureKeys(tenantId) : "ALL";
  if (!departmentId) return tenantSet;

  const deptSet = await getDepartmentActiveFeatureKeys(departmentId);
  if (deptSet === "ALL") return tenantSet;
  return deptSet;
}

export type FeatureCheck = { ok: true } | { ok: false; error: string };

/** Server-side 403 guard, same shape as assertFeatureEnabled (lib/feature-flags.ts). */
export async function assertTemplateFeatureEnabled(
  tenantId: string,
  key: TemplateFeatureKey,
): Promise<FeatureCheck> {
  const enabled = await hasTemplateFeature(tenantId, key);
  if (!enabled) {
    return { ok: false, error: `This feature ('${key}') isn't included in your organization's active templates.` };
  }
  return { ok: true };
}

export async function listCatalogueForTenant(tenantId: string) {
  const [templates, grants, requests] = await runAsSystem(() => Promise.all([
    prisma.template.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: { features: { select: { key: true } } },
    }),
    prisma.tenantTemplate.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { templateId: true },
    }),
    prisma.templateRequest.findMany({
      where: { tenantId, status: "PENDING" },
      select: { templateId: true },
    }),
  ]));

  const activeTemplateIds = new Set(grants.map((g) => g.templateId));
  const pendingTemplateIds = new Set(requests.map((r) => r.templateId));

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    features: template.features.map((f) => f.key),
    status: activeTemplateIds.has(template.id)
      ? ("active" as const)
      : pendingTemplateIds.has(template.id)
        ? ("requested" as const)
        : ("available" as const),
  }));
}

export async function requestTemplate(params: {
  tenantId: string;
  templateId: string;
  requestedById: string;
  message?: string;
}) {
  const [template, existingGrant, existingPending] = await Promise.all([
    prisma.template.findUnique({ where: { id: params.templateId }, select: { id: true, isActive: true, name: true } }),
    prisma.tenantTemplate.findUnique({
      where: { tenantId_templateId: { tenantId: params.tenantId, templateId: params.templateId } },
      select: { status: true },
    }),
    prisma.templateRequest.findFirst({
      where: { tenantId: params.tenantId, templateId: params.templateId, status: "PENDING" },
      select: { id: true },
    }),
  ]);

  if (!template || !template.isActive) {
    throw new Error("Template not found");
  }
  if (existingGrant?.status === "ACTIVE") {
    throw new Error("Your organization already has this template");
  }
  if (existingPending) {
    throw new Error("A request for this template is already pending");
  }

  const request = await prisma.templateRequest.create({
    data: {
      tenantId: params.tenantId,
      templateId: params.templateId,
      requestedById: params.requestedById,
      message: params.message,
    },
  });

  const superAdmins = await prisma.profile.findMany({
    where: { isSuperAdmin: true, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    superAdmins.map((admin) =>
      createNotification({
        recipientId: admin.id,
        actorId: params.requestedById,
        type: "template_request_submitted",
        message: `Enablement request for the "${template.name}" template is pending approval.`,
      }),
    ),
  );

  return request;
}

export async function reviewTemplateRequest(params: {
  requestId: string;
  decision: Extract<TemplateRequestStatus, "APPROVED" | "REJECTED">;
  reviewedById: string;
  reviewNote?: string;
}) {
  const request = await prisma.templateRequest.findUnique({
    where: { id: params.requestId },
    include: { template: { select: { name: true } } },
  });
  if (!request) throw new Error("Request not found");
  if (request.status !== "PENDING") throw new Error("Request has already been reviewed");
  if (params.decision === "REJECTED" && !params.reviewNote?.trim()) {
    throw new Error("A rejection reason is required");
  }

  await prisma.$transaction(async (tx) => {
    await tx.templateRequest.update({
      where: { id: request.id },
      data: {
        status: params.decision,
        reviewedById: params.reviewedById,
        reviewedAt: new Date(),
        reviewNote: params.reviewNote,
      },
    });

    if (params.decision === "APPROVED") {
      await tx.tenantTemplate.upsert({
        where: { tenantId_templateId: { tenantId: request.tenantId, templateId: request.templateId } },
        create: {
          tenantId: request.tenantId,
          templateId: request.templateId,
          activatedById: params.reviewedById,
        },
        update: { status: "ACTIVE", activatedById: params.reviewedById, activatedAt: new Date(), revokedAt: null },
      });
    }
  });

  await recordAuditEvent({
    tenantId: request.tenantId,
    actorId: params.reviewedById,
    action: params.decision === "APPROVED" ? "TEMPLATE_REQUEST_APPROVED" : "TEMPLATE_REQUEST_REJECTED",
    targetType: "TemplateRequest",
    targetId: request.id,
    after: { templateId: request.templateId, reviewNote: params.reviewNote },
  });

  await createNotification({
    recipientId: request.requestedById,
    actorId: params.reviewedById,
    type: "template_request_reviewed",
    message: templateRequestReviewedMessage(request.template.name, params.decision, params.reviewNote),
  });
}

/**
 * Tenant Admin enablement. With governance approval off, the template becomes
 * active immediately. With it on, this files a pending request, notifies Super
 * Admins, and leaves the template inactive until they approve.
 */
export async function enableTemplateForTenant(params: {
  tenantId: string;
  templateId: string;
  actorId: string;
  approvalRequired: boolean;
}): Promise<{ status: "active" | "requested" }> {
  if (!params.approvalRequired) {
    const template = await prisma.template.findUnique({
      where: { id: params.templateId },
      select: { id: true, isActive: true },
    });
    if (!template || !template.isActive) throw new Error("Template not found");
    await grantTemplateToTenant({
      tenantId: params.tenantId,
      templateId: params.templateId,
      actorId: params.actorId,
    });
    return { status: "active" };
  }

  await requestTemplate({
    tenantId: params.tenantId,
    templateId: params.templateId,
    requestedById: params.actorId,
  });
  return { status: "requested" };
}

export async function grantTemplateToTenant(params: { tenantId: string; templateId: string; actorId: string }) {
  await prisma.tenantTemplate.upsert({
    where: { tenantId_templateId: { tenantId: params.tenantId, templateId: params.templateId } },
    create: { tenantId: params.tenantId, templateId: params.templateId, activatedById: params.actorId },
    update: { status: "ACTIVE", activatedById: params.actorId, activatedAt: new Date(), revokedAt: null },
  });
  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TEMPLATE_GRANTED",
    targetType: "TenantTemplate",
    targetId: params.templateId,
  });
}

export async function revokeTemplateFromTenant(params: { tenantId: string; templateId: string; actorId: string }) {
  await prisma.tenantTemplate.update({
    where: { tenantId_templateId: { tenantId: params.tenantId, templateId: params.templateId } },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TEMPLATE_REVOKED",
    targetType: "TenantTemplate",
    targetId: params.templateId,
  });
}

export async function createTemplate(params: {
  name: string;
  slug: string;
  description?: string;
  featureKeys: TemplateFeatureKey[];
  createdById: string;
}) {
  return prisma.template.create({
    data: {
      name: params.name,
      slug: params.slug,
      description: params.description,
      createdById: params.createdById,
      features: { create: params.featureKeys.map((key) => ({ key })) },
    },
    include: { features: true },
  });
}

export async function updateTemplate(params: {
  id: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
}) {
  return prisma.template.update({
    where: { id: params.id },
    data: {
      name: params.name,
      description: params.description,
      isActive: params.isActive,
    },
  });
}

export async function setTemplateFeatures(templateId: string, featureKeys: TemplateFeatureKey[]) {
  await prisma.$transaction([
    prisma.templateFeature.deleteMany({ where: { templateId } }),
    prisma.templateFeature.createMany({ data: featureKeys.map((key) => ({ templateId, key })) }),
  ]);
  await syncGrantedTemplateFeatures(templateId, featureKeys);
}

/** Departments that already have this template pick up newly added marketplace features. */
async function syncGrantedTemplateFeatures(templateId: string, featureKeys: TemplateFeatureKey[]) {
  const token = `template:${templateId}`;
  const marketplaceKeys = featureKeys.filter(isMarketplaceFeatureKey);
  if (marketplaceKeys.length === 0) return;
  const departments = await prisma.department.findMany({
    select: { id: true, featureKeys: true },
  });
  for (const dept of departments) {
    if (!Array.isArray(dept.featureKeys) || !dept.featureKeys.includes(token)) continue;
    const current = grantedMarketplaceFeatures(dept.featureKeys);
    if (current === "ALL") continue;
    const missing = marketplaceKeys.filter((key) => !current.includes(key));
    if (missing.length === 0) continue;
    await prisma.department.update({
      where: { id: dept.id },
      data: { featureKeys: [...dept.featureKeys, ...missing] },
    });
  }
}

export async function archiveTemplate(id: string) {
  await prisma.template.update({ where: { id }, data: { isActive: false } });
}

/**
 * Ensure every system template (see system-templates.ts) exists in the
 * catalogue with exactly its defined feature set. Idempotent: creates missing
 * ones and re-syncs features/name/description on existing ones, keeping them
 * active. Additive only — never deletes. Safe to run on every deploy/boot.
 */
/**
 * Create any built-in feature template that is not in the catalogue yet.
 * Existing rows are left alone, so a renamed or re-featured template stays as edited.
 */
export async function ensureAvailableFeatureTemplates(createdById: string) {
  for (const tpl of AVAILABLE_FEATURE_TEMPLATES) {
    const existing = await prisma.template.findUnique({ where: { slug: tpl.slug }, select: { id: true } });
    if (existing) continue;
    await prisma.template.create({
      data: {
        name: tpl.name,
        slug: tpl.slug,
        description: tpl.description,
        createdById,
        features: { create: tpl.featureKeys.map((key) => ({ key })) },
      },
    });
  }
}

export async function ensureSystemTemplates(createdById: string) {
  for (const tpl of SYSTEM_TEMPLATES) {
    const existing = await prisma.template.findUnique({ where: { slug: tpl.slug }, select: { id: true } });
    if (existing) {
      await prisma.$transaction([
        prisma.templateFeature.deleteMany({ where: { templateId: existing.id } }),
        prisma.templateFeature.createMany({
          data: tpl.featureKeys.map((key) => ({ templateId: existing.id, key })),
        }),
        prisma.template.update({
          where: { id: existing.id },
          data: { name: tpl.name, description: tpl.description, isActive: true },
        }),
      ]);
    } else {
      await prisma.template.create({
        data: {
          name: tpl.name,
          slug: tpl.slug,
          description: tpl.description,
          createdById,
          features: { create: tpl.featureKeys.map((key) => ({ key })) },
        },
      });
    }
  }
}
