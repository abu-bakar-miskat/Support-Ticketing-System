import { getRequestScope, type RequestScope } from "@/lib/request-scope";

/**
 * Non-bypassable tenant scoping for the `Ticket` model (SRS D-02, C-01, API-04).
 *
 * A Prisma client extension consults the ambient request scope (see
 * `lib/request-scope`) and rewrites every ticket read so it can only observe
 * rows in the caller's tenant(s):
 *   - list reads (findMany/findFirst/count/aggregate/groupBy) get the tenant
 *     predicate AND-ed into their `where`, so an omitted `where` still filters;
 *   - unique reads (findUnique) are post-filtered — an out-of-tenant row becomes
 *     `null`, so the route returns 404 (not 403) per API-04.
 * Writes/creates pass through: cross-tenant isolation on the write path is
 * enforced upstream because the preceding fetch is now scope-filtered.
 *
 * The decision core is pure and unit-tested; the extension is a thin adapter.
 */

export type TicketScope =
  | { kind: "system" }
  | { kind: "platform" }
  | { kind: "tenant"; tenantIds: string[] };

const LIST_READ = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const UNIQUE_READ = new Set(["findUnique", "findUniqueOrThrow"]);

export type ScopePlan =
  | { type: "passthrough" }
  | { type: "inject" }
  | { type: "postfilter" };

/** Pure: how a ticket operation must be rewritten for the given scope. */
export function planTicketOperation(operation: string, scope: TicketScope): ScopePlan {
  if (scope.kind === "system" || scope.kind === "platform") return { type: "passthrough" };
  if (LIST_READ.has(operation)) return { type: "inject" };
  if (UNIQUE_READ.has(operation)) return { type: "postfilter" };
  return { type: "passthrough" };
}

type Where = Record<string, unknown> | undefined;

/** Pure: AND the tenant predicate into an existing (possibly undefined) where. */
export function mergeTenantWhere(where: Where, tenantIds: string[]): Record<string, unknown> {
  const predicate = { tenantId: { in: tenantIds } };
  if (!where || Object.keys(where).length === 0) return predicate;
  return { AND: [where, predicate] };
}

/** Pure: whether a fetched row is visible to the scope (used for unique reads). */
export function rowInScope(row: { tenantId?: string | null } | null, scope: TicketScope): boolean {
  if (row == null) return false;
  if (scope.kind === "system" || scope.kind === "platform") return true;
  return row.tenantId != null && scope.tenantIds.includes(row.tenantId);
}

/** Pure: map an explicit request scope to a ticket scope. */
export function scopeFromRequestScope(scope: RequestScope): TicketScope {
  if (scope.system) return { kind: "system" };
  if (scope.isPlatformAdmin) return { kind: "platform" };
  return { kind: "tenant", tenantIds: scope.tenantIds };
}

/**
 * Resolve the caller's ticket scope, fail-closed:
 *  1. an explicit ambient scope (tests, `runAsSystem`, `runWithScope`) wins —
 *     `AsyncLocalStorage.run` propagates reliably across awaits;
 *  2. otherwise fall back to the authenticated request's profile (React-cached,
 *     so this is effectively free after the first call). `enterWith` cannot be
 *     relied on here because App Router runs `getProfile` inside React `cache`,
 *     whose async context does not propagate back to the caller.
 * A ticket query with no ambient scope and no authenticated caller throws rather
 * than leaking every tenant — system/background code must use `runAsSystem`.
 */
export async function resolveTicketScope(): Promise<TicketScope> {
  const ambient = getRequestScope();
  if (ambient) return scopeFromRequestScope(ambient);

  // Dynamic import breaks the db → prisma-scope → profile → db module cycle.
  const { getProfile } = await import("@/lib/profile");
  const profile = await getProfile();
  if (!profile) {
    throw new Error(
      "Ticket query ran without a caller scope. Authenticated requests establish " +
        "scope via getProfile; wrap system/background access in runAsSystem().",
    );
  }
  return profile.isSuperAdmin
    ? { kind: "platform" }
    : { kind: "tenant", tenantIds: profile.tenantIds };
}

type QueryArgs = { where?: Where } & Record<string, unknown>;

/** Wrap a Prisma client so every Ticket query is tenant-scoped. */
export function withTicketScope<T>(client: T): T {
  return (client as { $extends: (ext: unknown) => unknown }).$extends({
    query: {
      ticket: {
        async $allOperations({
          operation,
          args,
          query,
        }: {
          operation: string;
          args: QueryArgs;
          query: (args: QueryArgs) => Promise<unknown>;
        }) {
          const scope = await resolveTicketScope();
          const plan = planTicketOperation(operation, scope);

          if (plan.type === "inject" && scope.kind === "tenant") {
            return query({ ...args, where: mergeTenantWhere(args.where, scope.tenantIds) });
          }

          if (plan.type === "postfilter") {
            // A `select` that omits tenantId would hide the field the check needs;
            // force it in, then strip it from the result so the response shape is
            // unchanged. `include`/no-projection already return all scalars.
            const select = args.select as Record<string, unknown> | undefined;
            const injectedTenantId = select != null && !("tenantId" in select);
            const runArgs = injectedTenantId
              ? { ...args, select: { ...select, tenantId: true } }
              : args;

            const result = (await query(runArgs)) as { tenantId?: string | null } | null;
            if (!rowInScope(result, scope)) {
              if (operation === "findUniqueOrThrow") throw new Error("No Ticket found");
              return null;
            }
            if (injectedTenantId && result != null) {
              const { tenantId: _dropped, ...rest } = result as Record<string, unknown>;
              return rest;
            }
            return result;
          }

          return query(args);
        },
      },
    },
  }) as unknown as T;
}
