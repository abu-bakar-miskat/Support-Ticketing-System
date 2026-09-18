// Tenant-in-URL routing helpers. The active tenant's SLUG is shown as the first
// URL segment for every tenant-scoped page (e.g. /pen-global-bd/board).
//
// The active-tenant cookie stores `id|slug` so the two cannot drift (legacy
// id-only values are still accepted). Middleware also forwards the URL slug via
// x-tenant-slug so SSR resolves the org from the link the user opened.

/** HttpOnly cookie: tenant id, optionally `id|slug` composite. */
export const ACTIVE_TENANT_COOKIE_NAME = "pen_active_tenant";

/** Cookie mirroring the active tenant's slug so middleware can build URLs
 *  without a DB lookup. Kept in sync whenever the active-tenant cookie is set. */
export const TENANT_SLUG_COOKIE = "pen_active_tenant_slug";

/** Request header set by proxy when the public URL carries a tenant slug. */
export const X_TENANT_SLUG_HEADER = "x-tenant-slug";

/** Cookie mirroring the active department's slug — the second URL segment for
 *  department-scoped pages (/<tenant>/<dept>/board). Set wherever the active
 *  department cookie (pen_active_dept) is set. */
export const DEPT_SLUG_COOKIE = "pen_active_dept_slug";

/** Cookie mirroring the active sub-department's slug — the third URL segment
 *  (/<tenant>/<dept>/<subdept>/board). Set wherever pen_active_team is set. */
export const SUBDEPT_SLUG_COOKIE = "pen_active_subdept_slug";

/** Encode id + slug into one cookie value so they cannot drift apart. */
export function formatActiveTenantCookie(id: string, slug: string): string {
  return `${id}|${slug}`;
}

/** Parse `id|slug` (or legacy bare id). */
export function parseActiveTenantCookie(
  raw: string | undefined | null,
): { id: string | null; slug: string | null } {
  if (!raw) return { id: null, slug: null };
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { id: raw, slug: null };
  const id = raw.slice(0, pipe).trim();
  const slug = raw.slice(pipe + 1).trim();
  return { id: id || null, slug: slug || null };
}

/**
 * Tenant-scoped roots that are NOT tied to a single department, so they carry
 * only the tenant slug (/<tenant>/departments), never a department slug.
 * Everything else in TENANT_SCOPED_ROOTS is department-scoped
 * (/<tenant>/<dept>/board).
 */
export const TENANT_LEVEL_ROOTS = new Set(["departments", "profile", "docs"]);

/**
 * Paths that also carry the active sub-department slug
 * (/<tenant>/<dept>/<subdept>/board). Department settings and similar stay at
 * /<tenant>/<dept>/… even when a sub-department cookie is set — otherwise a
 * sub-dept whose slug matches the tenant (e.g. both "vcad") looks like the
 * tenant name repeating in the URL.
 */
export const SUBDEPT_SCOPED_ROOTS = new Set([
  "board",
  "all-tasks",
  "tasks",
  "timeline",
  "calendar",
  "tickets",
  "modules",
  "time",
]);

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

/** True when the path should include /<subdept>/ in the public URL. */
export function isSubDeptScopedPath(pathname: string): boolean {
  if (pathname === "/") return false;
  return SUBDEPT_SCOPED_ROOTS.has(firstSegment(pathname));
}

/**
 * Top-level route segments that live *inside* a tenant (get the slug prefix).
 * Everything else (platform, login, auth, api, support, onboarding, invite,
 * screen, …) is tenant-agnostic and never prefixed.
 */
export const TENANT_SCOPED_ROOTS = new Set([
  "activity",
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
  "support-forms",
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
