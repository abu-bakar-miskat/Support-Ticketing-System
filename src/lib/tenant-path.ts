// Tenant-in-URL routing helpers. The active tenant's SLUG is shown as the first
// URL segment for every tenant-scoped page (e.g. /pen-global-bd/board). The
// authoritative scope source remains the ACTIVE_TENANT_COOKIE (tenant id) — the
// slug is cosmetic and always forced to match it, so this introduces no
// tenant-isolation risk. See proxy.ts (rewrite/redirect) and TenantSlugProvider.

/** Cookie mirroring the active tenant's slug so middleware can build URLs
 *  without a DB lookup. Set wherever ACTIVE_TENANT_COOKIE is set. */
export const TENANT_SLUG_COOKIE = "pen_active_tenant_slug";

/** Cookie mirroring the active department's slug — the second URL segment for
 *  department-scoped pages (/<tenant>/<dept>/board). Set wherever the active
 *  department cookie (pen_active_dept) is set. */
export const DEPT_SLUG_COOKIE = "pen_active_dept_slug";

/** Cookie mirroring the active sub-department's slug — the third URL segment
 *  (/<tenant>/<dept>/<subdept>/board). Set wherever pen_active_team is set. */
export const SUBDEPT_SLUG_COOKIE = "pen_active_subdept_slug";

/**
 * Tenant-scoped roots that are NOT tied to a single department, so they carry
 * only the tenant slug (/<tenant>/departments), never a department slug.
 * Everything else in TENANT_SCOPED_ROOTS is department-scoped
 * (/<tenant>/<dept>/board).
 */
export const TENANT_LEVEL_ROOTS = new Set(["departments", "profile", "docs"]);

/** True when a root segment belongs to a specific department (gets a dept slug). */
export function isDeptScopedRoot(seg: string): boolean {
  return TENANT_SCOPED_ROOTS.has(seg) && !TENANT_LEVEL_ROOTS.has(seg);
}

/**
 * True when a whole path is department-scoped (gets /<tenant>/<dept>/…). The
 * home dashboard ("/") belongs to the active department, so it's included.
 */
export function isDeptScopedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return isDeptScopedRoot(firstSegment(pathname));
}

/**
 * Top-level route segments that live *inside* a tenant (get the slug prefix).
 * Everything else (platform, login, auth, api, support, onboarding, invite,
 * screen, …) is tenant-agnostic and never prefixed.
 */
export const TENANT_SCOPED_ROOTS = new Set([
  "board",
  "all-tasks",
  "calendar",
  "department",
  "departments",
  "docs",
  "inbox",
  "mailboxes",
  "manager",
  "mentions",
  "modules",
  "profile",
  "projects",
  "recruitment",
  "reports",
  "settings",
  "sub-departments",
  "tasks",
  "tickets",
  "time",
  "timeline",
]);

/** First path segment (""/"board"/…) of a pathname. */
export function firstSegment(pathname: string): string {
  return pathname.split("/")[1] ?? "";
}

/** A bare (un-prefixed) tenant-scoped path — the dashboard home or a scoped root. */
export function isBareTenantScoped(pathname: string): boolean {
  if (pathname === "/") return true;
  return TENANT_SCOPED_ROOTS.has(firstSegment(pathname));
}

/** Remove a leading `/<slug>` if present, returning the internal path. */
export function stripTenantPrefix(pathname: string, slug: string): string {
  if (!slug) return pathname;
  if (pathname === `/${slug}`) return "/";
  const prefix = `/${slug}/`;
  if (pathname.startsWith(prefix)) return pathname.slice(slug.length + 1);
  return pathname;
}

/** Prefix an internal path with the tenant slug (idempotent). */
export function withTenant(slug: string, pathname: string): string {
  if (!slug) return pathname;
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return pathname;
  return `/${slug}${pathname === "/" ? "" : pathname}` || `/${slug}`;
}
