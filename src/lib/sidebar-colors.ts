/**
 * Accent colours for the grouped shell sidebars. Each nav group renders as a
 * soft tinted card derived from its accent (see components/dashboard/
 * sidebar-group-styles). Users:
 *  - platform (Super Admin) — stored as the `sidebarGroupColors` PlatformSetting
 *    row, edited on /platform/settings;
 *  - tenant departments shell (`sidebarColors`), in-department sidebar
 *    (`deptSidebarColors`) and Settings sub-nav (`settingsNavColors`) — stored
 *    inside Tenant.branding, edited on the tenant Branding page.
 * All live in free-form JSON, so no migration is needed.
 */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Merge a stored/submitted value over the defaults, dropping anything invalid. */
export function parseSidebarColors<K extends string>(
  keys: readonly K[],
  defaults: Record<K, string>,
  value: unknown,
): Record<K, string> {
  const result = { ...defaults };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of keys) {
      const color = (value as Record<string, unknown>)[key];
      if (isHexColor(color)) result[key] = color.toLowerCase();
    }
  }
  return result;
}

// ── Platform (Super Admin) sidebar ────────────────────────────────────────────

export const PLATFORM_SIDEBAR_GROUP_KEYS = ["organization", "analytics", "features", "system"] as const;

export type PlatformSidebarGroupKey = (typeof PLATFORM_SIDEBAR_GROUP_KEYS)[number];
export type PlatformSidebarColors = Record<PlatformSidebarGroupKey, string>;

export const PLATFORM_SIDEBAR_GROUP_LABELS: Record<PlatformSidebarGroupKey, string> = {
  organization: "Organization",
  analytics: "Analytics & Audit",
  features: "Feature Management",
  system: "System & Domains",
};

export const PLATFORM_SIDEBAR_COLOR_DEFAULTS: PlatformSidebarColors = {
  organization: "#f97316",
  analytics: "#6366f1",
  features: "#22c55e",
  system: "#3b82f6",
};

export function parsePlatformSidebarColors(value: unknown): PlatformSidebarColors {
  return parseSidebarColors(PLATFORM_SIDEBAR_GROUP_KEYS, PLATFORM_SIDEBAR_COLOR_DEFAULTS, value);
}

// ── Tenant departments sidebar ────────────────────────────────────────────────

export const TENANT_SIDEBAR_GROUP_KEYS = ["overview", "operations", "people", "tools"] as const;

export type TenantSidebarGroupKey = (typeof TENANT_SIDEBAR_GROUP_KEYS)[number];
export type TenantSidebarColors = Record<TenantSidebarGroupKey, string>;

export const TENANT_SIDEBAR_GROUP_LABELS: Record<TenantSidebarGroupKey, string> = {
  overview: "Overview",
  operations: "Operations",
  people: "People & Communication",
  tools: "Tools & Configuration",
};

export const TENANT_SIDEBAR_COLOR_DEFAULTS: TenantSidebarColors = {
  overview: "#3b82f6",
  operations: "#f97316",
  people: "#22c55e",
  tools: "#8b5cf6",
};

export function parseTenantSidebarColors(value: unknown): TenantSidebarColors {
  return parseSidebarColors(TENANT_SIDEBAR_GROUP_KEYS, TENANT_SIDEBAR_COLOR_DEFAULTS, value);
}

// ── In-department sidebar (components/dashboard/sidebar) ──────────────────────

export const DEPT_SIDEBAR_GROUP_KEYS = ["workspace", "operations", "team", "views", "account"] as const;

export type DeptSidebarGroupKey = (typeof DEPT_SIDEBAR_GROUP_KEYS)[number];
export type DeptSidebarColors = Record<DeptSidebarGroupKey, string>;

export const DEPT_SIDEBAR_GROUP_LABELS: Record<DeptSidebarGroupKey, string> = {
  workspace: "Workspace",
  operations: "Operations",
  team: "Team",
  views: "Views",
  account: "Account",
};

export const DEPT_SIDEBAR_COLOR_DEFAULTS: DeptSidebarColors = {
  workspace: "#3b82f6",
  operations: "#f43f5e",
  team: "#22c55e",
  views: "#8b5cf6",
  account: "#f97316",
};

export function parseDeptSidebarColors(value: unknown): DeptSidebarColors {
  return parseSidebarColors(DEPT_SIDEBAR_GROUP_KEYS, DEPT_SIDEBAR_COLOR_DEFAULTS, value);
}

// ── Settings sub-nav (components/settings/settings-layout) ────────────────────

export const SETTINGS_NAV_GROUP_KEYS = ["personal", "workspace", "configuration", "integrations"] as const;

export type SettingsNavGroupKey = (typeof SETTINGS_NAV_GROUP_KEYS)[number];
export type SettingsNavColors = Record<SettingsNavGroupKey, string>;

export const SETTINGS_NAV_GROUP_LABELS: Record<SettingsNavGroupKey, string> = {
  personal: "Personal",
  workspace: "Workspace",
  configuration: "Configuration",
  integrations: "Integrations",
};

export const SETTINGS_NAV_COLOR_DEFAULTS: SettingsNavColors = {
  personal: "#3b82f6",
  workspace: "#8b5cf6",
  configuration: "#f43f5e",
  integrations: "#22c55e",
};

export function parseSettingsNavColors(value: unknown): SettingsNavColors {
  return parseSidebarColors(SETTINGS_NAV_GROUP_KEYS, SETTINGS_NAV_COLOR_DEFAULTS, value);
}

/** Keep only valid hex entries for the given keys; null when none remain. */
export function pickSidebarColors<K extends string>(
  keys: readonly K[],
  value: unknown,
): Partial<Record<K, string>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const color = (value as Record<string, unknown>)[key];
    if (isHexColor(color)) out[key] = color.toLowerCase();
  }
  return Object.keys(out).length > 0 ? out : null;
}
