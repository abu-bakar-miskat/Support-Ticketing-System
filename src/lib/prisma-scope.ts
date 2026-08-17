import { getRequestScope, type RequestScope } from "@/lib/request-scope";

/**
 * Non-bypassable tenant scoping for every model that carries a `tenantId`
 * column — `Ticket`, `Project`, `Team`, `Department` (SRS D-02, C-01, API-04).
 *
 * A Prisma client extension consults the ambient request scope (see
 * `lib/request-scope`) and rewrites every read so it can only observe rows in
 * the caller's tenant(s):
 *   - list reads (findMany/findFirst/count/aggregate/groupBy) get the tenant
 *     predicate AND-ed into their `where`, so an omitted `where` still filters;
 *   - unique reads (findUnique) are post-filtered — an out-of-tenant row becomes
 *     `null`, so the route returns 404 (not 403) per API-04.
 * Writes/creates pass through: cross-tenant isolation on the write path is
 * enforced upstream because the preceding fetch is now scope-filtered.
 *
 * This is the non-bypassable backstop beneath the hand-written department/
 * workspace `where` filters (see lib/dept-scope) — those remain as finer UX
 * scoping layered on top, but are no longer the sole tenant-isolation control.
 *
 * NOTE: like all model-scoped Prisma query extensions, this fires only for
 * top-level operations on these models, not for nested relation reads pulled in
 * via `include`/`select`. Nested reads inherit the parent row's scope, which is
 * already tenant-filtered, so this matches the pre-existing Ticket behavior.
 *
 * The decision core is pure and unit-tested; the extension is a thin adapter.
 */

/** Prisma model keys (camelCase delegate names) that carry a `tenantId`. */
export const TENANT_SCOPED_MODELS = ["ticket", "project", "team", "department"] as const;

export type TicketScope =
  | { kind: "system" }
  | { kind: "platform" }
  | {
      kind: "tenant";
      tenantIds: string[];
      /**
       * SD-06 sub-department restriction (team-id allowlist). When set, ticket
       * reads are additionally bound to these teams. Undefined = no restriction.
       */
      subDepartmentTeamIds?: string[];
    };

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

/**
 * Pure: the sub-department (teamId) allowlist that applies to this model under
 * this scope, or null when unrestricted. Only the `Ticket` model carries the
 * sub-department tag (its `teamId`), so every other model is always null.
 */
export function subDepartmentAllowlist(modelLabel: string, scope: TicketScope): string[] | null {
  if (modelLabel !== "Ticket") return null;
  if (scope.kind !== "tenant") return null;
  return scope.subDepartmentTeamIds ?? null;
}

/**
 * Pure: AND the tenant predicate — and, for tickets, the SD-06 sub-department
 * predicate — into an existing (possibly undefined) where. A null allowlist adds
 * no sub-department constraint, so this reduces to {@link mergeTenantWhere}.
 */
export function mergeScopeWhere(
  where: Where,
  tenantIds: string[],
  subDepartmentTeamIds: string[] | null,
): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [];
  if (where && Object.keys(where).length > 0) parts.push(where);
  parts.push({ tenantId: { in: tenantIds } });
  if (subDepartmentTeamIds) parts.push({ teamId: { in: subDepartmentTeamIds } });
  return parts.length === 1 ? parts[0] : { AND: parts };
}

/** Pure: whether a fetched row is visible to the scope (used for unique reads). */
export function rowInScope(row: { tenantId?: string | null } | null, scope: TicketScope): boolean {
  if (row == null) return false;
  if (scope.kind === "system" || scope.kind === "platform") return true;
  return row.tenantId != null && scope.tenantIds.includes(row.tenantId);
}

/**
 * Pure: whether a fetched row satisfies the sub-department allowlist. A null
 * allowlist (unrestricted / non-ticket) always passes; otherwise the row's
 * `teamId` must be in the allowlist.
 */
export function rowSubDepartmentAllowed(
  row: { teamId?: string | null } | null,
  allowlist: string[] | null,
): boolean {
  if (allowlist == null) return true;
  if (row == null) return false;
  return row.teamId != null && allowlist.includes(row.teamId);
}

/** Pure: map an explicit request scope to a ticket scope. */
export function scopeFromRequestScope(scope: RequestScope): TicketScope {
  if (scope.system) return { kind: "system" };
  if (scope.isPlatformAdmin) return { kind: "platform" };
  return {
    kind: "tenant",
    tenantIds: scope.tenantIds,
    ...(scope.subDepartmentTeamIds ? { subDepartmentTeamIds: scope.subDepartmentTeamIds } : {}),
  };
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

/**
 * Shared `$allOperations` adapter: rewrites one operation on one tenant-scoped
 * model per the pure plan. `modelLabel` only shapes the not-found error message.
 */
async function applyTenantScope(
  modelLabel: string,
  operation: string,
  args: QueryArgs,
  query: (args: QueryArgs) => Promise<unknown>,
): Promise<unknown> {
  const scope = await resolveTicketScope();
  const plan = planTicketOperation(operation, scope);
  const subAllow = subDepartmentAllowlist(modelLabel, scope);

  if (plan.type === "inject" && scope.kind === "tenant") {
    return query({ ...args, where: mergeScopeWhere(args.where, scope.tenantIds, subAllow) });
  }

  if (plan.type === "postfilter") {
    // A `select` that omits the fields the checks need would hide them; force
    // them in, then strip whatever we injected so the response shape is
    // unchanged. `include`/no-projection already return all scalars.
    const select = args.select as Record<string, unknown> | undefined;
    const injectedTenantId = select != null && !("tenantId" in select);
    const injectedTeamId = subAllow != null && select != null && !("teamId" in select);
    const runArgs =
      injectedTenantId || injectedTeamId
        ? {
            ...args,
            select: {
              ...select,
              ...(injectedTenantId ? { tenantId: true } : {}),
              ...(injectedTeamId ? { teamId: true } : {}),
            },
          }
        : args;

    const result = (await query(runArgs)) as
      | { tenantId?: string | null; teamId?: string | null }
      | null;
    if (!rowInScope(result, scope) || !rowSubDepartmentAllowed(result, subAllow)) {
      if (operation === "findUniqueOrThrow") throw new Error(`No ${modelLabel} found`);
      return null;
    }
    if (result != null && (injectedTenantId || injectedTeamId)) {
      const rest = { ...(result as Record<string, unknown>) };
      if (injectedTenantId) delete rest.tenantId;
      if (injectedTeamId) delete rest.teamId;
      return rest;
    }
    return result;
  }

  return query(args);
}

/**
 * Wrap a Prisma client so every read of the given tenant-scoped models is bound
 * to the caller's tenant(s). Defaults to {@link TENANT_SCOPED_MODELS}.
 *
 * `models` is a parameter (not hard-wired to the full set) because turning a new
 * model on is only safe once every anonymous/background path that queries it is
 * wrapped in `runAsSystem` — otherwise `resolveTicketScope` throws for the
 * caller-less path. See lib/db for the currently-enabled set and the rollout.
 */
export function withTenantScope<T>(
  client: T,
  models: readonly string[] = TENANT_SCOPED_MODELS,
): T {
  const query: Record<string, unknown> = {};
  for (const model of models) {
    const modelLabel = model.charAt(0).toUpperCase() + model.slice(1);
    query[model] = {
      async $allOperations({
        operation,
        args,
        query: run,
      }: {
        operation: string;
        args: QueryArgs;
        query: (args: QueryArgs) => Promise<unknown>;
      }) {
        return applyTenantScope(modelLabel, operation, args, run);
      },
    };
  }
  return (client as { $extends: (ext: unknown) => unknown }).$extends({ query }) as unknown as T;
}

/** @deprecated Use {@link withTenantScope}; retained as an alias during cutover. */
export const withTicketScope = withTenantScope;
