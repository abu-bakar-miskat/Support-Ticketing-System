import "server-only";
import { prisma } from "@/lib/db";
import {
  MARKETPLACE_FEATURE_KEYS,
  isMarketplaceFeatureKey,
  type MarketplaceFeatureKey,
} from "@/lib/template-features";
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
   * Marketplace features a new department is created with. Keys set to true are
   * written onto Department.featureKeys at creation. Existing departments are
   * not changed. Keys left off stay requestable from the Features marketplace.
   */
  newDepartmentFeatureDefaults: Record<MarketplaceFeatureKey, boolean>;
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
  /**
   * SA-02 enforcement (opt-in). When true, a tenant is only operational while a
   * valid Agreement covers today: getProfile blocks members of any tenant whose
   * agreement is missing/expired/invalid (like a suspension), and every blocked
   * access attempt flags the Super Admins. Off by default so pre-existing
   * tenants that predate the Agreement feature aren't locked out. See
   * lib/tenant-agreement-access.
   */
  enforceTenantAgreements: boolean;
};

function defaultNewDepartmentFeatureDefaults(): Record<MarketplaceFeatureKey, boolean> {
  return Object.fromEntries(MARKETPLACE_FEATURE_KEYS.map((key) => [key, false])) as Record<
    MarketplaceFeatureKey,
    boolean
  >;
}

export const PLATFORM_SETTINGS_DEFAULTS: PlatformSettings = {
  platformName: "Global Support Portal",
  supportEmail: "",
  devMode: false,
  newDepartmentFeatureDefaults: defaultNewDepartmentFeatureDefaults(),
  otpEmailTemplate: null,
  templateEnablementRequiresApproval: false,
  enforceTenantAgreements: false,
};

/** Coerce a stored JSON value into a validated OTP template, or null. */
function parseOtpTemplate(value: unknown): OtpEmailTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { subject, bodyHtml } = value as Record<string, unknown>;
  if (typeof subject !== "string" || !subject.trim()) return null;
  if (typeof bodyHtml !== "string" || !bodyHtml.trim()) return null;
  return { subject, bodyHtml };
}

/** Coerce a stored JSON value into the department-creation feature defaults. */
function parseDepartmentFeatureDefaults(value: unknown): Record<MarketplaceFeatureKey, boolean> {
  const result = defaultNewDepartmentFeatureDefaults();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
      if (isMarketplaceFeatureKey(key) && typeof enabled === "boolean") result[key] = enabled;
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
    newDepartmentFeatureDefaults: parseDepartmentFeatureDefaults(byKey.get("newDepartmentFeatureDefaults")),
    otpEmailTemplate: parseOtpTemplate(byKey.get("otpEmailTemplate")),
    templateEnablementRequiresApproval: byKey.get("templateEnablementRequiresApproval") === true,
    enforceTenantAgreements: byKey.get("enforceTenantAgreements") === true,
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
  if (patch.newDepartmentFeatureDefaults !== undefined) {
    writes.push({
      key: "newDepartmentFeatureDefaults",
      value: parseDepartmentFeatureDefaults(patch.newDepartmentFeatureDefaults),
    });
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
  if (patch.enforceTenantAgreements !== undefined) {
    writes.push({ key: "enforceTenantAgreements", value: patch.enforceTenantAgreements === true });
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

/** Marketplace features to grant when a department is created. */
export async function defaultDepartmentFeatureKeys(): Promise<MarketplaceFeatureKey[]> {
  const { newDepartmentFeatureDefaults } = await getPlatformSettings();
  return MARKETPLACE_FEATURE_KEYS.filter((key) => newDepartmentFeatureDefaults[key]);
}
