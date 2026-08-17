/**
 * Per-form branding for the public support form page. All fields are optional
 * overrides; unset ones fall back to the workspace brand (see `resolveFormBranding`).
 * Kept free of server-only imports so both the admin client editor and the
 * server (API + public page) can share the types and helpers.
 */
export type FormBranding = {
  /** Logo shown in the page header banner. */
  logoUrl?: string;
  /** Banner color behind the logo/title. */
  headerColor?: string;
  /** Page background color. */
  backgroundColor?: string;
  /** Primary color for the submit button, links, and highlights. */
  accentColor?: string;
  /** Short message shown under the form title. */
  introText?: string;
  /** Message shown after a successful submission. */
  confirmationText?: string;
};

/** Brand defaults the form inherits from when a field is not overridden. */
export type FormBrandingDefaults = {
  logoUrl: string;
  headerColor: string;
  accentColor: string;
};

/** Fully-resolved branding used to render the public page. */
export type ResolvedFormBranding = {
  logoUrl: string | null;
  headerColor: string;
  backgroundColor: string | null;
  accentColor: string;
  introText: string | null;
  confirmationText: string | null;
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_URL = 2048;
const MAX_TEXT = 500;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

function cleanColor(value: unknown): string | undefined {
  return isHexColor(value) ? (value as string).trim() : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL) return undefined;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return undefined;
  return trimmed;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_TEXT);
}

/**
 * Validates and normalizes an incoming branding payload, dropping any invalid
 * or empty fields. Returns `null` when nothing valid remains (which clears the
 * stored override so the form falls back to workspace defaults).
 */
export function sanitizeFormBranding(input: unknown): FormBranding | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const next: FormBranding = {};
  const logoUrl = cleanUrl(raw.logoUrl);
  const headerColor = cleanColor(raw.headerColor);
  const backgroundColor = cleanColor(raw.backgroundColor);
  const accentColor = cleanColor(raw.accentColor);
  const introText = cleanText(raw.introText);
  const confirmationText = cleanText(raw.confirmationText);
  if (logoUrl) next.logoUrl = logoUrl;
  if (headerColor) next.headerColor = headerColor;
  if (backgroundColor) next.backgroundColor = backgroundColor;
  if (accentColor) next.accentColor = accentColor;
  if (introText) next.introText = introText;
  if (confirmationText) next.confirmationText = confirmationText;
  return Object.keys(next).length > 0 ? next : null;
}

/** Reads a stored branding blob (e.g. from `IntakeFormConfig.branding`). */
export function readFormBranding(stored: unknown): FormBranding {
  return sanitizeFormBranding(stored) ?? {};
}

/**
 * Layers a form's stored overrides on top of the workspace brand defaults to
 * produce the concrete values the public page renders with.
 */
export function resolveFormBranding(
  stored: unknown,
  defaults: FormBrandingDefaults,
): ResolvedFormBranding {
  const b = readFormBranding(stored);
  return {
    logoUrl: b.logoUrl ?? defaults.logoUrl ?? null,
    headerColor: b.headerColor ?? defaults.headerColor,
    backgroundColor: b.backgroundColor ?? null,
    accentColor: b.accentColor ?? defaults.accentColor,
    introText: b.introText ?? null,
    confirmationText: b.confirmationText ?? null,
  };
}
