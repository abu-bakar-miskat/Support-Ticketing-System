import "server-only";
import { prisma } from "@/lib/db";
import { PLATFORM_FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";

/**
 * Per-tenant feature flags (slice 19, SA-04). Fail-open by design: a tenant
 * with no `FeatureFlag` row for a key has that feature enabled — a row only
 * exists once a Super Admin has explicitly toggled something, so shipping a
 * new feature never requires a backfill across every existing tenant.
 */

export async function isFeatureEnabled(tenantId: string, key: FeatureKey): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { enabled: true },
  });
  return flag?.enabled ?? true;
}

export type FeatureCheck = { ok: true } | { ok: false; error: string };

/**
 * Guard for any API route that should reject a disabled feature with 403
 * (SA-04) — the server-side half; callers must check this even when the UI
 * already hides the affected control, since the UI hide is advisory only.
 */
export async function assertFeatureEnabled(tenantId: string, key: FeatureKey): Promise<FeatureCheck> {
  const enabled = await isFeatureEnabled(tenantId, key);
  if (!enabled) {
    return { ok: false, error: `This feature ('${key}') is disabled for your organization.` };
  }
  return { ok: true };
}

/** SA-04 UI half: the effective enabled/disabled state of every known feature for one tenant. */
export async function listFeatureFlags(tenantId: string): Promise<Record<FeatureKey, boolean>> {
  const rows = await prisma.featureFlag.findMany({
    where: { tenantId },
    select: { key: true, enabled: true },
  });
  const overrides = new Map(rows.map((r) => [r.key, r.enabled]));
  const result = {} as Record<FeatureKey, boolean>;
  for (const key of PLATFORM_FEATURE_KEYS) {
    result[key] = overrides.get(key) ?? true;
  }
  return result;
}

/**
 * Super Admin toggle. The flag update and its audit event are one atomic
 * transaction — a change to a compliance-relevant switch like this should
 * never land without the record of who changed it.
 */
export async function setFeatureFlag(params: {
  tenantId: string;
  key: FeatureKey;
  enabled: boolean;
  actorId: string;
}): Promise<void> {
  const existing = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
    select: { enabled: true },
  });
  const before = existing?.enabled ?? true;
  if (before === params.enabled) return; // no-op, nothing to audit

  await prisma.$transaction([
    prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId: params.tenantId, key: params.key } },
      create: { tenantId: params.tenantId, key: params.key, enabled: params.enabled, updatedById: params.actorId },
      update: { enabled: params.enabled, updatedById: params.actorId },
    }),
    prisma.auditEvent.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        action: params.enabled ? "FEATURE_FLAG_ENABLED" : "FEATURE_FLAG_DISABLED",
        targetType: "FeatureFlag",
        targetId: params.key,
        before: { enabled: before },
        after: { enabled: params.enabled },
      },
    }),
  ]);
}
