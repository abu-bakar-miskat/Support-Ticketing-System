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
   * Sub-department (subDepartment) allowlist for SD-06. When present, ticket reads are
   * additionally restricted to these subDepartment ids — a sub-department-scoped caller
   * never observes tickets outside their granted sub-departments on any read
   * path. Absent/undefined = whole-department access (no sub-department filter).
   */
  subDepartmentTeamIds?: string[];
  /**
   * ASG-06 explicit per-ticket read-access grants (see lib/prisma-scope's
   * `grantedTicketIds`) — carves an exception into the sub-department
   * allowlist above for exactly these ticket ids.
   */
  grantedTicketIds?: string[];
};

// Pinned to globalThis so every module copy shares ONE AsyncLocalStorage. The
// Prisma client (and its scope extension, which reads this store via
// getRequestScope) is cached on globalThis in lib/db and survives HMR/bundle
// reloads; a plain module-const store would be re-created on reload, leaving
// the cached extension reading a stale instance. That desync made `runAsSystem`
// (e.g. the inbound-email webhook) set context on one store while the extension
// checked another — the query then saw no scope and threw "ran without a caller
// scope" on the first tenant-scoped model it touched.
const globalForScope = globalThis as unknown as {
  __requestScopeStore?: AsyncLocalStorage<RequestScope>;
};
const store =
  globalForScope.__requestScopeStore ??
  (globalForScope.__requestScopeStore = new AsyncLocalStorage<RequestScope>());

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
 * Ambient scope for a unique ticket read/write (detail, comments, attachments).
 *
 * Super-admins skip tenant scoping. Everyone else gets their tenants plus an
 * exception for *this* ticket id — do not call `resolveProfileTicketScope()`
 * here. That scans every assigned ticket (`getExceptionTicketIds`) before the
 * unique read starts, which is why comments/detail were instant for
 * super-admins and hung or 404'd for other roles.
 *
 * Real authorization still happens after the unique read via `assertTicketAccess`.
 */
export function uniqueTicketReadScope(
  profile: { isSuperAdmin?: boolean; tenantIds: string[] },
  ticketId: string,
): RequestScope {
  if (profile.isSuperAdmin) {
    return { isPlatformAdmin: true, tenantIds: [] };
  }
  return {
    tenantIds: profile.tenantIds ?? [],
    grantedTicketIds: [ticketId],
  };
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
