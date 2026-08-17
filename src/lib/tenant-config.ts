import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { resolveTenantBranding, type ResolvedTenantBranding } from "@/lib/tenant-branding";

/** JSON config keys a tenant owns (absorbed from the former Workspace singleton). */
export const TENANT_JSON_CONFIG_KEYS = [
  "emailConfig",
  "timeTrackingConfig",
  "approvalsConfig",
] as const;

export type TenantJsonConfigKey = (typeof TENANT_JSON_CONFIG_KEYS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Raw tenant config row (JSON columns), or null when the tenant is missing. */
export async function getTenantConfig(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      branding: true,
      emailConfig: true,
      timeTrackingConfig: true,
      approvalsConfig: true,
    },
  });
}

/** The tenant's stored emailConfig, resolved via a department's tenant. */
export async function tenantEmailConfigForDepartment(
  departmentId: string,
): Promise<unknown | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { tenant: { select: { emailConfig: true } } },
  });
  return dept?.tenant?.emailConfig ?? null;
}

/** The tenant's stored emailConfig by tenant id. */
export async function tenantEmailConfig(tenantId: string): Promise<unknown | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { emailConfig: true },
  });
  return t?.emailConfig ?? null;
}

/** Resolved shell branding for a tenant. */
export async function getTenantBranding(tenantId: string): Promise<ResolvedTenantBranding | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { branding: true },
  });
  if (!t) return null;
  return resolveTenantBranding(t.branding);
}

/** Replace a tenant's branding wholesale (so cleared fields actually disappear). */
export async function setTenantBranding(
  tenantId: string,
  branding: Record<string, unknown>,
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { branding: branding as Prisma.InputJsonValue },
  });
}

/**
 * Shallow-merge JSON config patches onto a tenant so a partial save (just the
 * notification switches, or just branding) never clobbers sibling keys.
 * Mirrors the merge the former /api/workspace PATCH used.
 */
export async function updateTenantConfig(
  tenantId: string,
  patch: {
    name?: string;
    branding?: Record<string, unknown>;
  } & Partial<Record<TenantJsonConfigKey, Record<string, unknown>>>,
): Promise<void> {
  const existing = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { branding: true, emailConfig: true, timeTrackingConfig: true, approvalsConfig: true },
  });
  if (!existing) throw new Error(`Tenant ${tenantId} not found`);

  const data: Prisma.TenantUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;

  const mergeKey = (key: TenantJsonConfigKey | "branding", value: Record<string, unknown>) => {
    const current = existing[key];
    return (isPlainObject(current) ? { ...current, ...value } : value) as Prisma.InputJsonValue;
  };

  if (patch.branding !== undefined) data.branding = mergeKey("branding", patch.branding);
  for (const key of TENANT_JSON_CONFIG_KEYS) {
    const v = patch[key];
    if (v !== undefined) data[key] = mergeKey(key, v);
  }

  await prisma.tenant.update({ where: { id: tenantId }, data });
}
