/**
 * Per-tenant branding for the app shell: the display name and logo shown once a
 * tenant is active. Tenants customize their logo/name only — they do NOT recolor
 * the app (the theme/brand color stays the product default everywhere).
 */

export type TenantBranding = {
  /** Org name shown in the shell (falls back to Tenant.name). */
  displayName?: string;
  /** Logo image URL for the sidebar (absolute or root-relative). */
  logoUrl?: string;
  /** Hide the logo in the shell; the display name then fills the width. */
  hideLogo?: boolean;
  /** Hide the display name in the shell; the logo then fills the width. */
  hideDisplayName?: boolean;
};

export type ResolvedTenantBranding = {
  displayName: string | null;
  logoUrl: string | null;
  hideLogo: boolean;
  hideDisplayName: boolean;
};

const MAX_URL = 2048;
const MAX_NAME = 120;

function isUsableUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_URL &&
    /^(https?:\/\/|\/)/.test(value)
  );
}

/** Validate/normalize raw input; returns null when nothing usable remains. */
export function sanitizeTenantBranding(input: unknown): TenantBranding | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const out: TenantBranding = {};

  if (typeof raw.displayName === "string") {
    const name = raw.displayName.trim().slice(0, MAX_NAME);
    if (name) out.displayName = name;
  }
  if (isUsableUrl(raw.logoUrl)) out.logoUrl = raw.logoUrl;
  // At most one may be hidden — hiding both would leave the shell blank.
  if (raw.hideLogo === true) out.hideLogo = true;
  else if (raw.hideDisplayName === true) out.hideDisplayName = true;

  return Object.keys(out).length > 0 ? out : null;
}

/** Safe reader for a stored branding JSON value. */
export function readTenantBranding(stored: unknown): TenantBranding {
  return sanitizeTenantBranding(stored) ?? {};
}

/**
 * Resolve stored branding into concrete shell values. `displayName`/`logoUrl`
 * stay null when not explicitly set, so the shell keeps the default product logo
 * for an unbranded tenant rather than rendering the raw tenant name as text.
 */
export function resolveTenantBranding(stored: unknown): ResolvedTenantBranding {
  const b = readTenantBranding(stored);
  return {
    displayName: b.displayName ?? null,
    logoUrl: b.logoUrl ?? null,
    hideLogo: b.hideLogo ?? false,
    hideDisplayName: b.hideDisplayName ?? false,
  };
}
