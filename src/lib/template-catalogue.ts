import "server-only";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { createNotification } from "@/lib/notify";
import { TEMPLATE_FEATURE_KEYS, type TemplateFeatureKey } from "@/lib/template-features";
import type { TemplateRequestStatus } from "@/generated/prisma/enums";

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
  const grants = await prisma.tenantTemplate.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { template: { select: { features: { select: { key: true } } } } },
  });
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
  const [templates, grants, requests] = await Promise.all([
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
  ]);

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
        message: `New request for the "${template.name}" template.`,
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
    message:
      params.decision === "APPROVED"
        ? `Your request for the "${request.template.name}" template was approved.`
        : `Your request for the "${request.template.name}" template was rejected.`,
  });
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
}

export async function archiveTemplate(id: string) {
  await prisma.template.update({ where: { id }, data: { isActive: false } });
}
