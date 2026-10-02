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

/** Request-scoped department/sub-department context derived from the public
 * URL. Unlike cookies, these values remain independent between browser tabs. */
export const X_DEPARTMENT_SLUG_HEADER = "x-department-slug";
export const X_SUBDEPARTMENT_SLUG_HEADER = "x-subdepartment-slug";

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
 *
 * `profile` and `docs` are intentionally NOT here: although their content is
 * user/tenant-level, they stay within the active department's URL
 * (/<tenant>/<dept>/profile) so navigating to them from a workspace keeps the
 * department context in the URL and sidebar. The dept segment is cosmetic —
 * both resolve to the same internal /profile and /docs pages.
 */
export const TENANT_LEVEL_ROOTS = new Set(["departments"]);

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

/** Top-level application routes which can contain names also used by tenant
 * routes (for example /platform/settings) but are never tenant prefixes. */
const NON_TENANT_PREFIXES = new Set([
  "api",
  "auth",
  "invite",
  "login",
  "offline",
  "onboarding",
  "platform",
  "screen",
  "support",
  "tenant-invite",
]);

export type TenantPathContext = {
  tenantSlug: string;
  departmentSlug: string | null;
  subDepartmentSlug: string | null;
  /** The real App Router path after removing cosmetic scope segments. */
  internalPath: string;
};

/**
 * Parse a public tenant URL into the request context and internal App Router
 * path it represents.
 *
 * Examples:
 *   /acme/departments            -> tenant acme, /departments
 *   /acme/support/board          -> tenant acme, dept support, /board
 *   /acme/support/triage/board   -> plus sub-dept triage, /board
 *
 * Bare internal routes such as /departments deliberately return null; those
 * continue to use the legacy cookie fallback and canonical redirect.
 */
export function parseTenantPathContext(pathname: string): TenantPathContext | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) {
    const tenantSlug = segments[0]!.trim().toLowerCase();
    if (!tenantSlug || NON_TENANT_PREFIXES.has(tenantSlug) || TENANT_SCOPED_ROOTS.has(tenantSlug)) {
      return null;
    }
    return {
      tenantSlug,
      departmentSlug: null,
      subDepartmentSlug: null,
      internalPath: "/",
    };
  }

  const rootIndex = segments.findIndex((segment) => TENANT_SCOPED_ROOTS.has(segment));
  if (rootIndex === -1 && segments.length === 2) {
    const tenantSlug = segments[0]!.trim().toLowerCase();
    const departmentSlug = segments[1]!.trim().toLowerCase();
    if (
      !tenantSlug ||
      !departmentSlug ||
      NON_TENANT_PREFIXES.has(tenantSlug)
    ) {
      return null;
    }
    return {
      tenantSlug,
      departmentSlug,
      subDepartmentSlug: null,
      internalPath: "/",
    };
  }
  if (rootIndex <= 0) return null;

  const root = segments[rootIndex]!;
  const tenantSlug = segments[0]?.trim().toLowerCase() ?? "";
  if (!tenantSlug || NON_TENANT_PREFIXES.has(tenantSlug)) return null;

  const tenantLevel = TENANT_LEVEL_ROOTS.has(root);
  // Tenant-level routes have exactly one cosmetic prefix. Department routes
  // require a department prefix and may additionally carry a sub-department
  // slug only for roots that support one. Never accept /<tenant>/<root> for a
  // department route: doing so leaves department resolution to shared cookies.
  if (tenantLevel && rootIndex !== 1) return null;
  if (!tenantLevel) {
    const maxRootIndex = SUBDEPT_SCOPED_ROOTS.has(root) ? 3 : 2;
    if (rootIndex < 2 || rootIndex > maxRootIndex) return null;
  }

  const departmentSlug = !tenantLevel && rootIndex >= 2
    ? (segments[1]?.trim().toLowerCase() || null)
    : null;
  const subDepartmentSlug =
    !tenantLevel && rootIndex >= 3 && SUBDEPT_SCOPED_ROOTS.has(root)
      ? (segments[2]?.trim().toLowerCase() || null)
      : null;

  return {
    tenantSlug,
    departmentSlug,
    subDepartmentSlug,
    internalPath: `/${segments.slice(rootIndex).join("/")}`,
  };
}

/**
 * Return the tenant slug when a URL puts a department-scoped root directly
 * after the tenant (for example /acme/tasks). This is an incomplete public URL,
 * not a legacy bare route: the missing department must not be guessed from a
 * browser-wide cookie.
 */
export function tenantWithMissingDepartment(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || !isDeptScopedRoot(segments[1]!)) return null;

  const tenantSlug = segments[0]!.trim().toLowerCase();
  if (
    !tenantSlug ||
    NON_TENANT_PREFIXES.has(tenantSlug) ||
    TENANT_SCOPED_ROOTS.has(tenantSlug)
  ) {
    return null;
  }

  return tenantSlug;
}

/** First path segment (""/"board"/…) of a pathname. */
export function firstSegment(pathname: string): string {
  return pathname.split("/")[1] ?? "";
}

/**
 * Drop leading tenant, department, and sub-department slugs so route checks see
 * the App Router path. `/acme/support/board` and `/acme/support/triage/board`
 * both become `/board`. A path that already starts at a known root is unchanged.
 */
export function toInternalAppPath(pathname: string): string {
  let path = pathname || "/";
  for (;;) {
    const segment = firstSegment(path);
    if (!segment || TENANT_SCOPED_ROOTS.has(segment)) break;
    path = path.slice(segment.length + 1) || "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
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
