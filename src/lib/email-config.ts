import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { BRAND, HEADER_BG, LOGO_URL } from "@/lib/email-templates/_shared";
import { tenantEmailConfigForDepartment } from "@/lib/tenant-config";

export type EmailBranding = {
  brandColor: string;
  headerColor: string;
  logoUrl: string;
  footerText: string;
};

export type EmailConfig = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  notifyAssignment: boolean;
  notifyMention: boolean;
  notifyIntakeConfirmation: boolean;
  notifyResolution: boolean;
  notifyCustomerReply: boolean;
  notifyTicketCompleted: boolean;
  notifyAssignmentFailed: boolean;
} & EmailBranding;

/** Whether a Resend API key is present in the environment. */
export const RESEND_CONFIGURED = Boolean(process.env.RESEND_API_KEY);

/** Receiving subdomain that accepts customer replies, e.g. `reply.pengroup.com`. */
export const INBOUND_DOMAIN = (process.env.RESEND_INBOUND_DOMAIN ?? "").trim();

/**
 * Whether two-way customer replies can be received. Requires both a Resend key
 * (to send) and a configured inbound domain (to receive). When false, the
 * feature degrades to outbound-only and the reply composer is hidden.
 */
export const RESEND_RECEIVING_ENABLED =
  RESEND_CONFIGURED && Boolean(INBOUND_DOMAIN);

/** Address portion of the configured RESEND_FROM_EMAIL (handles "Name <addr>" form). */
function defaultFromEmail(): string {
  const raw = process.env.RESEND_FROM_EMAIL ?? "onboarding@mail.pengroup.com";
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

export const DEFAULT_FOOTER_TEXT =
  "© {year} PEN Global. This is an automated message.";

export function emailConfigDefaults(): EmailConfig {
  return {
    fromName: "PEN Platform",
    fromEmail: defaultFromEmail(),
    replyTo: "",
    notifyAssignment: true,
    notifyMention: true,
    notifyIntakeConfirmation: true,
    notifyResolution: true,
    notifyCustomerReply: true,
    notifyTicketCompleted: true,
    notifyAssignmentFailed: true,
    brandColor: BRAND,
    headerColor: HEADER_BG,
    logoUrl: LOGO_URL,
    footerText: DEFAULT_FOOTER_TEXT,
  };
}

function mergeConfig(
  defaults: EmailConfig,
  stored: Record<string, unknown> | null | undefined,
): EmailConfig {
  if (!stored) return defaults;
  const merged = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof EmailConfig)[]) {
    const value = stored[key];
    if (typeof value === typeof merged[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = value;
    }
  }
  return merged;
}

export const EMAIL_NOTIFY_KEYS = [
  "notifyAssignment",
  "notifyMention",
  "notifyIntakeConfirmation",
  "notifyResolution",
  "notifyCustomerReply",
  "notifyTicketCompleted",
  "notifyAssignmentFailed",
] as const;

export type EmailNotifyKey = (typeof EMAIL_NOTIFY_KEYS)[number];

function readNotifyOverrides(
  emailConfig: unknown,
): Partial<Record<EmailNotifyKey, boolean>> {
  if (typeof emailConfig !== "object" || emailConfig === null || Array.isArray(emailConfig)) {
    return {};
  }
  const stored = (emailConfig as Record<string, unknown>).notifyOverrides;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const result: Partial<Record<EmailNotifyKey, boolean>> = {};
  for (const key of EMAIL_NOTIFY_KEYS) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

/** Reads one department's own notification-toggle overrides (no fallback applied). */
export async function getDepartmentNotifyOverrides(
  departmentId: string,
): Promise<Partial<Record<EmailNotifyKey, boolean>>> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  return readNotifyOverrides(department?.emailConfig);
}

/** DS-02: one of a department's configured send-from addresses. */
export type EmailSender = {
  id: string;
  name: string;
  email: string;
  isDefault: boolean;
};

export type EmailIdentityOverride = {
  /** The default sender's name/email — derived from `senders`, kept for backward-compat reads. */
  fromName?: string;
  fromEmail?: string;
  /** DS-02: the full list of configured senders, exactly one of which is the default. */
  senders?: EmailSender[];
};

/** Pure: exactly one sender ends up `isDefault` — the first one marked, or the first sender if none were. */
function ensureSingleDefault(senders: EmailSender[]): EmailSender[] {
  if (senders.length === 0) return senders;
  const winnerId = senders.find((s) => s.isDefault)?.id ?? senders[0].id;
  return senders.map((s) => ({ ...s, isDefault: s.id === winnerId }));
}

/**
 * Reads `identity.senders` (DS-02's multi-sender shape); falls back to the
 * legacy single `fromName`/`fromEmail` pair (pre-slice-15 departments) as a
 * single synthesized default sender when no `senders` array is present.
 */
function readSenders(identity: Record<string, unknown>): EmailSender[] {
  const raw = identity.senders;
  if (Array.isArray(raw)) {
    const senders = raw
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && !Array.isArray(s))
      .map((s) => ({
        id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : randomUUID(),
        name: typeof s.name === "string" ? s.name.trim() : "",
        email: typeof s.email === "string" ? s.email.trim().toLowerCase() : "",
        isDefault: s.isDefault === true,
      }))
      .filter((s) => s.email);
    if (senders.length > 0) return ensureSingleDefault(senders);
  }

  const fromName = typeof identity.fromName === "string" ? identity.fromName.trim() : "";
  const fromEmail = typeof identity.fromEmail === "string" ? identity.fromEmail.trim() : "";
  if (fromEmail) return [{ id: "legacy", name: fromName, email: fromEmail, isDefault: true }];
  return [];
}

/** Parses a department's sender(s) override out of its raw `emailConfig` JSON value. */
export function readIdentityOverride(emailConfig: unknown): EmailIdentityOverride {
  if (typeof emailConfig !== "object" || emailConfig === null || Array.isArray(emailConfig)) {
    return {};
  }
  const stored = (emailConfig as Record<string, unknown>).identity;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};

  const senders = readSenders(stored as Record<string, unknown>);
  const defaultSender = senders.find((s) => s.isDefault) ?? senders[0];
  const result: EmailIdentityOverride = {};
  if (senders.length > 0) result.senders = senders;
  if (defaultSender?.name) result.fromName = defaultSender.name;
  if (defaultSender?.email) result.fromEmail = defaultSender.email;
  return result;
}

/** Reads one department's own From name/email override (no fallback applied). */
export async function getDepartmentEmailIdentity(
  departmentId: string,
): Promise<EmailIdentityOverride> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  return readIdentityOverride(department?.emailConfig);
}

/**
 * Saves (or clears, when a field is null) a department's From name/email
 * override. Passing `null` for both fields clears the override entirely,
 * falling back to the workspace-wide address.
 */
export async function saveDepartmentEmailIdentity(
  departmentId: string,
  identity: { fromName?: string | null; fromEmail?: string | null },
): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  const existingConfig =
    department?.emailConfig && typeof department.emailConfig === "object" && !Array.isArray(department.emailConfig)
      ? (department.emailConfig as Record<string, unknown>)
      : {};
  const nextIdentity = { ...readIdentityOverride(existingConfig) };
  if (identity.fromName !== undefined) {
    if (identity.fromName === null || !identity.fromName.trim()) delete nextIdentity.fromName;
    else nextIdentity.fromName = identity.fromName.trim();
  }
  if (identity.fromEmail !== undefined) {
    if (identity.fromEmail === null || !identity.fromEmail.trim()) delete nextIdentity.fromEmail;
    else nextIdentity.fromEmail = identity.fromEmail.trim();
  }
  const nextConfig = { ...existingConfig, identity: nextIdentity };
  await prisma.department.update({
    where: { id: departmentId },
    data: { emailConfig: nextConfig as Prisma.InputJsonValue },
  });
}

/**
 * DS-02: replaces a department's full list of sender/reply-to addresses.
 * Exactly one ends up `isDefault` (the first one marked, or the first sender
 * if none were) — see {@link ensureSingleDefault}. Passing an empty array
 * clears every sender, falling back to the workspace-wide address.
 */
export async function saveDepartmentEmailSenders(
  departmentId: string,
  senders: { id?: string; name: string; email: string; isDefault?: boolean }[],
): Promise<EmailSender[]> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  const existingConfig =
    department?.emailConfig && typeof department.emailConfig === "object" && !Array.isArray(department.emailConfig)
      ? (department.emailConfig as Record<string, unknown>)
      : {};
  const existingIdentity: Record<string, unknown> =
    existingConfig.identity && typeof existingConfig.identity === "object" && !Array.isArray(existingConfig.identity)
      ? (existingConfig.identity as Record<string, unknown>)
      : {};

  const normalized = ensureSingleDefault(
    senders
      .map((s) => ({
        id: s.id?.trim() || randomUUID(),
        name: s.name.trim(),
        email: s.email.trim().toLowerCase(),
        isDefault: s.isDefault === true,
      }))
      .filter((s) => s.email),
  );

  // The senders list is now the sole source of truth — drop the legacy
  // single-sender fields so a later read can't resurrect a stale default.
  const nextIdentity: Record<string, unknown> = { ...existingIdentity, senders: normalized };
  delete nextIdentity.fromName;
  delete nextIdentity.fromEmail;

  const nextConfig = { ...existingConfig, identity: nextIdentity };
  await prisma.department.update({
    where: { id: departmentId },
    data: { emailConfig: nextConfig as Prisma.InputJsonValue },
  });
  return normalized;
}

/**
 * DS-02: resolves the sender a specific send should use — the explicitly
 * requested one (`overrideSenderId`) when it exists among the department's
 * configured senders, otherwise the department's default. Null when the
 * department has no senders configured at all (caller falls back further,
 * e.g. to the workspace-wide address via `getEmailConfig`).
 */
export async function resolveDepartmentSender(
  departmentId: string,
  overrideSenderId?: string | null,
): Promise<{ name: string; email: string } | null> {
  const { senders = [] } = await getDepartmentEmailIdentity(departmentId);
  if (overrideSenderId) {
    const chosen = senders.find((s) => s.id === overrideSenderId);
    if (chosen) return { name: chosen.name, email: chosen.email };
  }
  const fallback = senders.find((s) => s.isDefault) ?? senders[0];
  return fallback ? { name: fallback.name, email: fallback.email } : null;
}

const BRANDING_KEYS = ["brandColor", "headerColor", "logoUrl", "footerText"] as const;

/** Parses a department's branding override out of its raw `emailConfig` JSON value. */
export function readBrandingOverride(emailConfig: unknown): Partial<EmailBranding> {
  if (typeof emailConfig !== "object" || emailConfig === null || Array.isArray(emailConfig)) {
    return {};
  }
  const stored = (emailConfig as Record<string, unknown>).branding;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const result: Partial<EmailBranding> = {};
  for (const key of BRANDING_KEYS) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) result[key] = trimmed;
    }
  }
  return result;
}

/** Reads one department's own branding override (no fallback applied). */
export async function getDepartmentEmailBranding(
  departmentId: string,
): Promise<Partial<EmailBranding>> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  return readBrandingOverride(department?.emailConfig);
}

/**
 * Saves (or, when `branding` is null, clears) a department's branding override.
 * Partial objects only update the keys provided; pass `null` to fall back to
 * the workspace-wide branding for every field.
 */
export async function saveDepartmentEmailBranding(
  departmentId: string,
  branding: Partial<EmailBranding> | null,
): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  const existingConfig =
    department?.emailConfig && typeof department.emailConfig === "object" && !Array.isArray(department.emailConfig)
      ? (department.emailConfig as Record<string, unknown>)
      : {};

  let nextBranding: Partial<EmailBranding>;
  if (branding === null) {
    nextBranding = {};
  } else {
    nextBranding = { ...readBrandingOverride(existingConfig) };
    for (const key of BRANDING_KEYS) {
      if (branding[key] === undefined) continue;
      const value = branding[key]?.trim() ?? "";
      if (!value) delete nextBranding[key];
      else nextBranding[key] = value;
    }
  }

  const nextConfig = { ...existingConfig, branding: nextBranding };
  await prisma.department.update({
    where: { id: departmentId },
    data: { emailConfig: nextConfig as Prisma.InputJsonValue },
  });
}

/**
 * Saves (or, when `value` is null, clears) one department's override for a
 * notification toggle. Workspace-wide defaults are edited separately via
 * `updateWorkspace` and are not affected by this.
 */
export async function saveDepartmentNotifyOverride(
  key: EmailNotifyKey,
  value: boolean | null,
  departmentId: string,
): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  const existingConfig =
    department?.emailConfig && typeof department.emailConfig === "object" && !Array.isArray(department.emailConfig)
      ? (department.emailConfig as Record<string, unknown>)
      : {};
  const nextOverrides = { ...readNotifyOverrides(existingConfig) };
  if (value === null) {
    delete nextOverrides[key];
  } else {
    nextOverrides[key] = value;
  }
  const nextConfig = { ...existingConfig, notifyOverrides: nextOverrides };
  await prisma.department.update({
    where: { id: departmentId },
    data: { emailConfig: nextConfig as Prisma.InputJsonValue },
  });
}

/**
 * Reads workspace email settings, merged over typed defaults. Pass `departmentId`
 * to layer that department's notification-toggle, From identity, and branding
 * overrides on top — reply-to stays workspace-wide.
 */
export async function getEmailConfig(departmentId?: string | null): Promise<EmailConfig> {
  const defaults = emailConfigDefaults();
  // Base = the tenant's email config (resolved via the department). Falls back to
  // the legacy Workspace singleton when there's no department or no tenant config
  // (preserves prior behavior; the PEN tenant is backfilled from Workspace).
  let stored: unknown = departmentId
    ? await tenantEmailConfigForDepartment(departmentId)
    : null;
  if (stored == null) {
    const workspace = await prisma.workspace.findFirst();
    stored = workspace?.emailConfig ?? null;
  }
  let config: EmailConfig;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    config = defaults;
  } else {
    config = mergeConfig(defaults, stored as Record<string, unknown>);
  }
  // Env var always wins over DB-stored value when explicitly set.
  if (process.env.RESEND_FROM_EMAIL) {
    config = { ...config, fromEmail: defaultFromEmail() };
  }
  if (departmentId) {
    const overrides = await getDepartmentNotifyOverrides(departmentId);
    config = { ...config, ...overrides };
    const identity = await getDepartmentEmailIdentity(departmentId);
    if (identity.fromName) config = { ...config, fromName: identity.fromName };
    if (identity.fromEmail) config = { ...config, fromEmail: identity.fromEmail };
    const branding = await getDepartmentEmailBranding(departmentId);
    if (Object.keys(branding).length > 0) {
      config = { ...config, ...branding };
    }
  }
  return config;
}

/** The Resend `from` header, e.g. `PEN Platform <onboarding@mail.pengroup.com>`. */
export function fromHeader(config: EmailConfig): string {
  return `${config.fromName} <${config.fromEmail}>`;
}

export function brandingFrom(config: EmailConfig): EmailBranding {
  return {
    brandColor: config.brandColor,
    headerColor: config.headerColor,
    logoUrl: config.logoUrl,
    footerText: config.footerText,
  };
}

export const EMAIL_TEMPLATE_KEYS = [
  "assignment",
  "customerReply",
  "intakeConfirmation",
  "invite",
  "mention",
  "resolution",
  "ticketCompleted",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

/** An admin-authored override for one template's subject/heading/body/footer. All
 * fields may contain `{{placeholder}}` tokens (unresolved ones render empty, DS-04);
 * unset fields fall back to the built-in default (or, for `footerText`, the
 * department/tenant/platform default chain — DS-05/06) at render time. */
export type EmailTemplateOverride = {
  subject?: string;
  heading?: string;
  bodyHtml?: string;
  footerText?: string;
};

function readTemplateOverrides(
  emailConfig: unknown,
): Partial<Record<EmailTemplateKey, EmailTemplateOverride>> {
  if (typeof emailConfig !== "object" || emailConfig === null || Array.isArray(emailConfig)) {
    return {};
  }
  const stored = (emailConfig as Record<string, unknown>).customTemplates;
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  return stored as Partial<Record<EmailTemplateKey, EmailTemplateOverride>>;
}

/** Reads the workspace-wide template overrides (the fallback every department inherits from). */
export async function getWorkspaceTemplateOverrides(): Promise<
  Partial<Record<EmailTemplateKey, EmailTemplateOverride>>
> {
  const workspace = await prisma.workspace.findFirst();
  return readTemplateOverrides(workspace?.emailConfig);
}

/** Reads one department's own template overrides (no fallback applied). */
export async function getDepartmentTemplateOverrides(
  departmentId: string,
): Promise<Partial<Record<EmailTemplateKey, EmailTemplateOverride>>> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  return readTemplateOverrides(department?.emailConfig);
}

/**
 * Reads the effective template overrides, keyed by template. When `departmentId`
 * is given, that department's overrides win per-key over the workspace default;
 * templates the department hasn't customized still fall back to the workspace
 * (and ultimately the built-in default at render time).
 */
export async function getEmailTemplateOverrides(
  departmentId?: string | null,
): Promise<Partial<Record<EmailTemplateKey, EmailTemplateOverride>>> {
  if (!departmentId) return getWorkspaceTemplateOverrides();
  // Base = the tenant's template overrides (via the department), falling back to
  // the legacy Workspace singleton when the tenant has none.
  const tenantConfig = await tenantEmailConfigForDepartment(departmentId);
  const baseOverrides =
    tenantConfig != null
      ? readTemplateOverrides(tenantConfig)
      : await getWorkspaceTemplateOverrides();
  const departmentOverrides = await getDepartmentTemplateOverrides(departmentId);
  return { ...baseOverrides, ...departmentOverrides };
}

function applyTemplateOverride(
  existingConfig: Record<string, unknown>,
  key: EmailTemplateKey,
  override: EmailTemplateOverride | null,
): Record<string, unknown> {
  const existingTemplates = readTemplateOverrides(existingConfig);
  const nextTemplates = { ...existingTemplates };
  if (override) {
    nextTemplates[key] = override;
  } else {
    delete nextTemplates[key];
  }
  return { ...existingConfig, customTemplates: nextTemplates };
}

/**
 * Saves (or, when `override` is null, clears) one template's department-scoped
 * override. `departmentId` is required — templates are always edited per department.
 */
export async function saveEmailTemplateOverride(
  key: EmailTemplateKey,
  override: EmailTemplateOverride | null,
  departmentId: string,
): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { emailConfig: true },
  });
  const existingConfig =
    department?.emailConfig && typeof department.emailConfig === "object" && !Array.isArray(department.emailConfig)
      ? (department.emailConfig as Record<string, unknown>)
      : {};
  const nextConfig = applyTemplateOverride(existingConfig, key, override);
  await prisma.department.update({
    where: { id: departmentId },
    data: { emailConfig: nextConfig as Prisma.InputJsonValue },
  });
}
