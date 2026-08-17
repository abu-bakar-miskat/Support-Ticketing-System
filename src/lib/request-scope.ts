import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped caller context for non-bypassable data scoping (SRS D-02, C-01).
 *
 * Every authenticated request establishes a scope near the top (see
 * `getProfile`), and the Prisma scope extension (see `lib/prisma-scope`) reads it
 * to filter tenant-scoped models automatically. Because the extension consults
 * this ambient scope rather than a per-call-site argument, a call site cannot
 * forget to scope its query.
 *
 * System/background code that legitimately spans tenants (crons, migrations,
 * intake) must opt out explicitly via `runAsSystem` — the only sanctioned bypass.
 */
export type RequestScope = {
  /** Bypass all tenant scoping (service-role/system paths). */
  system?: boolean;
  /** Super-admin — may act across every tenant. */
  isPlatformAdmin?: boolean;
  /** Tenants the caller may observe. Ignored when system/platform. */
  tenantIds: string[];
  /**
   * Sub-department (team) allowlist for SD-06. When present, ticket reads are
   * additionally restricted to these team ids — a sub-department-scoped caller
   * never observes tickets outside their granted sub-departments on any read
   * path. Absent/undefined = whole-department access (no sub-department filter).
   */
  subDepartmentTeamIds?: string[];
};

const store = new AsyncLocalStorage<RequestScope>();

/** The active caller scope, or null when none has been established. */
export function getRequestScope(): RequestScope | null {
  return store.getStore() ?? null;
}

/**
 * Set the caller scope for the current async execution and everything it awaits.
 * Called once per request after the profile resolves. Uses `enterWith` because
 * the request continuation is not a single wrapped callback in App Router.
 */
export function enterRequestScope(scope: RequestScope): void {
  store.enterWith(scope);
}

/** Run `fn` under an explicit caller scope (used by tests and wrapped callbacks). */
export function runWithScope<T>(scope: RequestScope, fn: () => T): T {
  return store.run(scope, fn);
}

/**
 * Run `fn` with tenant scoping disabled. The sole sanctioned bypass — reserve for
 * trusted system paths (crons, migrations, cross-tenant intake) and keep the
 * bypassed region as small as possible.
 */
export function runAsSystem<T>(fn: () => T): T {
  return store.run({ system: true, tenantIds: [] }, fn);
}

/**
 * Wrap an anonymous/background route handler (webhook, cron, public intake) so
 * its whole body runs under {@link runAsSystem}. These paths have no
 * authenticated caller, so without an explicit scope the tenant extension would
 * throw (fail-closed) on the first tenant-scoped query. The wrapper is the
 * sanctioned opt-out for genuinely cross-tenant system work.
 *
 *   export const POST = withSystemScope(handlePost)
 */
export function withSystemScope<A extends unknown[], R>(
  handler: (...args: A) => R,
): (...args: A) => R {
  return (...args: A) => runAsSystem(() => handler(...args));
}
