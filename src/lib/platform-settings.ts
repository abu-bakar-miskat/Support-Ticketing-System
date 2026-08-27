import "server-only";
import { prisma } from "@/lib/db";
import { PLATFORM_FEATURE_KEYS, isFeatureKey, type FeatureKey } from "@/lib/feature-keys";

/**
 * Platform-wide global configuration (see the PlatformSetting model). Each
 * top-level field is stored as its own PlatformSetting row (row `key` = field
 * name, `value` = JSON), so reads merge stored rows over the defaults below and
 * writes only touch the fields that changed. Adding a field here never needs a
 * migration — the column is free-form JSON.
 */
export type PlatformSettings = {
  /** Display name for the platform, shown in the admin shell / emails. */
  platformName: string;
  /** Support contact address surfaced to tenant admins. "" = unset. */
  supportEmail: string;
  /**
   * Feature defaults applied when a NEW tenant is created. A key set to false
   * seeds a disabled FeatureFlag row for that tenant at creation time (existing
   * tenants are untouched — feature flags are fail-open, see lib/feature-flags).
   */
  newTenantFeatureDefaults: Record<FeatureKey, boolean>;
};

function allFeaturesEnabled(): Record<FeatureKey, boolean> {
  return Object.fromEntries(PLATFORM_FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>;
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  platformName: "Support Platform",
  supportEmail: "",
  newTenantFeatureDefaults: allFeaturesEnabled(),
};

/** Coerce a stored JSON value into a validated feature-defaults map. */
function parseFeatureDefaults(value: unknown): Record<FeatureKey, boolean> {
  const result = allFeaturesEnabled();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isFeatureKey(k) && typeof v === "boolean") result[k] = v;
    }
  }
  return result;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]));

  const platformName = byKey.get("platformName");
  const supportEmail = byKey.get("supportEmail");

  return {
    platformName: typeof platformName === "string" && platformName.trim() ? platformName : PLATFORM_SETTINGS_DEFAULTS.platformName,
    supportEmail: typeof supportEmail === "string" ? supportEmail : PLATFORM_SETTINGS_DEFAULTS.supportEmail,
    newTenantFeatureDefaults: parseFeatureDefaults(byKey.get("newTenantFeatureDefaults")),
  };
}

/**
 * Persist a partial update. Only the provided fields are written (each as an
 * upserted row), stamping who changed it. Returns the full merged settings.
 */
export async function setPlatformSettings(
  patch: Partial<PlatformSettings>,
  actorId: string,
): Promise<PlatformSettings> {
  const writes: { key: string; value: unknown }[] = [];
  if (patch.platformName !== undefined) writes.push({ key: "platformName", value: patch.platformName.trim() });
  if (patch.supportEmail !== undefined) writes.push({ key: "supportEmail", value: patch.supportEmail.trim() });
  if (patch.newTenantFeatureDefaults !== undefined) {
    writes.push({ key: "newTenantFeatureDefaults", value: parseFeatureDefaults(patch.newTenantFeatureDefaults) });
  }

  await prisma.$transaction(
    writes.map((w) =>
      prisma.platformSetting.upsert({
        where: { key: w.key },
        create: { key: w.key, value: w.value as never, updatedById: actorId },
        update: { value: w.value as never, updatedById: actorId },
      }),
    ),
  );

  return getPlatformSettings();
}

/** Feature keys a newly-created tenant should have DISABLED (default-off). */
export async function newTenantDisabledFeatureKeys(): Promise<FeatureKey[]> {
  const { newTenantFeatureDefaults } = await getPlatformSettings();
  return PLATFORM_FEATURE_KEYS.filter((k) => newTenantFeatureDefaults[k] === false);
}
