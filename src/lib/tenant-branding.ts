/**
 * Per-tenant branding for the app shell: the display name, logo, and accent
 * color applied once a tenant is active. The accent replaces the product orange
 * as the theme accent (see lib/tenant-accent for the light/dark derivation).
 */

import { normalizeHex } from "@/lib/tenant-accent";
import {
  DEPT_SIDEBAR_GROUP_KEYS,
  SETTINGS_NAV_GROUP_KEYS,
  TENANT_SIDEBAR_GROUP_KEYS,
  parseDeptSidebarColors,
  parseSettingsNavColors,
  parseTenantSidebarColors,
  pickSidebarColors,
  type DeptSidebarColors,
  type SettingsNavColors,
  type TenantSidebarColors,
} from "@/lib/sidebar-colors";

export type TenantBranding = {
  /** Org name shown in the shell (falls back to Tenant.name). */
  displayName?: string;
  /** Logo image URL for the sidebar (absolute or root-relative). */
  logoUrl?: string;
  /** Optional logo variant shown in the dark theme (falls back to logoUrl). */
  logoUrlDark?: string;
  /** Hide the logo in the shell; the display name then fills the width. */
  hideLogo?: boolean;
  /**
   * Hide the display name in the shell; the logo then fills the width.
   * Defaults ON (unset = hidden) — stored explicitly as `false` when turned off.
   */
  hideDisplayName?: boolean;
  /** Brand hex (#rrggbb) used as the theme accent; unset = product default. */
  accentColor?: string;
  /** Accent per departments-sidebar nav group; missing keys use the defaults. */
  sidebarColors?: Partial<TenantSidebarColors>;
  /** Accent per in-department sidebar nav group. */
  deptSidebarColors?: Partial<DeptSidebarColors>;
  /** Accent per Settings sub-nav group. */
  settingsNavColors?: Partial<SettingsNavColors>;
};

export type ResolvedTenantBranding = {
  displayName: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  hideLogo: boolean;
  hideDisplayName: boolean;
  accentColor: string | null;
  sidebarColors: TenantSidebarColors;
  deptSidebarColors: DeptSidebarColors;
  settingsNavColors: SettingsNavColors;
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
  if (isUsableUrl(raw.logoUrlDark)) out.logoUrlDark = raw.logoUrlDark;
  const accent = normalizeHex(raw.accentColor);
  if (accent) out.accentColor = accent;
  const sidebarColors = pickSidebarColors(TENANT_SIDEBAR_GROUP_KEYS, raw.sidebarColors);
  if (sidebarColors) out.sidebarColors = sidebarColors;
  const deptSidebarColors = pickSidebarColors(DEPT_SIDEBAR_GROUP_KEYS, raw.deptSidebarColors);
  if (deptSidebarColors) out.deptSidebarColors = deptSidebarColors;
  const settingsNavColors = pickSidebarColors(SETTINGS_NAV_GROUP_KEYS, raw.settingsNavColors);
  if (settingsNavColors) out.settingsNavColors = settingsNavColors;
  // At most one may be hidden — hiding both would leave the shell blank.
  // hideDisplayName defaults on, so an explicit `false` is kept to record opt-out.
  if (raw.hideLogo === true) out.hideLogo = true;
  else if (typeof raw.hideDisplayName === "boolean") out.hideDisplayName = raw.hideDisplayName;

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
    // A dark-only upload still counts as the logo (shown in both themes).
    logoUrl: b.logoUrl ?? b.logoUrlDark ?? null,
    logoUrlDark: b.logoUrlDark ?? null,
    hideLogo: b.hideLogo ?? false,
    // Default on — but only when there's a logo to fill the width.
    hideDisplayName: b.hideDisplayName ?? (!b.hideLogo && !!(b.logoUrl ?? b.logoUrlDark)),
    accentColor: b.accentColor ?? null,
    sidebarColors: parseTenantSidebarColors(b.sidebarColors),
    deptSidebarColors: parseDeptSidebarColors(b.deptSidebarColors),
    settingsNavColors: parseSettingsNavColors(b.settingsNavColors),
  };
}
