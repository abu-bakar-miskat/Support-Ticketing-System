import "server-only";
import { prisma } from "@/lib/db";
import { PLATFORM_FEATURE_KEYS, isFeatureKey, type FeatureKey } from "@/lib/feature-keys";
import type { OtpEmailTemplate } from "@/lib/email-templates/otp";

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
   * When true, OTP / invite / authentication emails are delivered to Mailpit
   * instead of Resend. Any address can be invited or signed in — codes land in
   * the shared Mailpit inbox. Production traffic should leave this off.
   */
  devMode: boolean;
  /**
   * Feature defaults applied when a NEW tenant is created. A key set to false
   * seeds a disabled FeatureFlag row for that tenant at creation time (existing
   * tenants are untouched — feature flags are fail-open, see lib/feature-flags).
   */
  newTenantFeatureDefaults: Record<FeatureKey, boolean>;
  /**
   * Super-admin override for the OTP sign-in email (subject + full body HTML,
   * `{{code}}` placeholder). `null` means "use the built-in OTP_DEFAULT". OTP is
   * platform-global because login is email-first — there's no tenant/department
   * context when a code is sent. See lib/email-templates/otp.ts.
   */
  otpEmailTemplate: OtpEmailTemplate | null;
  /**
   * When true, a Tenant Admin "Enable" on the marketplace creates a pending
   * request and leaves the template inactive until a Super Admin approves it.
   * When false, Enable activates the template immediately.
   */
  templateEnablementRequiresApproval: boolean;
};

function allFeaturesEnabled(): Record<FeatureKey, boolean> {
  return Object.fromEntries(PLATFORM_FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>;
}

function defaultNewTenantFeatureDefaults(): Record<FeatureKey, boolean> {
  return allFeaturesEnabled();
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  platformName: "Support Platform",
  supportEmail: "",
  devMode: false,
  newTenantFeatureDefaults: defaultNewTenantFeatureDefaults(),
  otpEmailTemplate: null,
  templateEnablementRequiresApproval: false,
};

/** Coerce a stored JSON value into a validated OTP template, or null. */
function parseOtpTemplate(value: unknown): OtpEmailTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { subject, bodyHtml } = value as Record<string, unknown>;
  if (typeof subject !== "string" || !subject.trim()) return null;
  if (typeof bodyHtml !== "string" || !bodyHtml.trim()) return null;
  return { subject, bodyHtml };
}

/** Coerce a stored JSON value into a validated feature-defaults map. */
function parseFeatureDefaults(value: unknown): Record<FeatureKey, boolean> {
  const result = defaultNewTenantFeatureDefaults();
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
  const devMode = byKey.get("devMode");

  return {
    platformName: typeof platformName === "string" && platformName.trim() ? platformName : PLATFORM_SETTINGS_DEFAULTS.platformName,
    supportEmail: typeof supportEmail === "string" ? supportEmail : PLATFORM_SETTINGS_DEFAULTS.supportEmail,
    devMode: typeof devMode === "boolean" ? devMode : PLATFORM_SETTINGS_DEFAULTS.devMode,
    newTenantFeatureDefaults: parseFeatureDefaults(byKey.get("newTenantFeatureDefaults")),
    otpEmailTemplate: parseOtpTemplate(byKey.get("otpEmailTemplate")),
    templateEnablementRequiresApproval: byKey.get("templateEnablementRequiresApproval") === true,
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
  if (patch.devMode !== undefined) writes.push({ key: "devMode", value: patch.devMode });
  if (patch.newTenantFeatureDefaults !== undefined) {
    writes.push({ key: "newTenantFeatureDefaults", value: parseFeatureDefaults(patch.newTenantFeatureDefaults) });
  }
  if (patch.otpEmailTemplate !== undefined) {
    // null clears the override (falls back to OTP_DEFAULT at render time).
    writes.push({ key: "otpEmailTemplate", value: parseOtpTemplate(patch.otpEmailTemplate) });
  }
  if (patch.templateEnablementRequiresApproval !== undefined) {
    writes.push({
      key: "templateEnablementRequiresApproval",
      value: patch.templateEnablementRequiresApproval === true,
    });
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
