import "server-only";
import { createTtlCache } from "@/lib/ttl-cache";
import { runAsSystem } from "@/lib/request-scope";

/**
 * Cross-request authorization scope caches.
 *
 * Per-request `React.cache()` dedupes these lookups within one render, but every
 * concurrent ticket-scoped request still re-ran them — the dominant query
 * pattern behind the `EMAXCONN` pool contention. These caches collapse that load
 * across requests on the same instance (see `lib/ttl-cache` for the caveats).
 *
 * Two separate caches with different consistency contracts:
 *   - Cache A (role/sub-department scope): changes rarely, has clean write-side
 *     choke points, so it is explicitly invalidated via {@link invalidateUserScope}.
 *     Its TTL is only a cross-instance staleness backstop.
 *   - Cache B (exception ticket IDs): the primary-assignee write sites are
 *     scattered across ~15 ticket routes with no single choke point, so this is
 *     TTL-only by deliberate decision — a just-assigned user may wait up to the
 *     TTL to see the ticket. No explicit invalidation.
 */

const isTest = process.env.NODE_ENV === "test";
// Cache A is invalidated explicitly; the TTL is the cross-instance backstop.
const ROLE_SCOPE_TTL_MS = isTest ? 0 : 15_000;
// Cache B is TTL-only, so the TTL is also the visibility-lag bound.
const EXCEPTION_IDS_TTL_MS = isTest ? 0 : 10_000;
const MAX_USERS = 5_000;

// Cache A — role + sub-department team scope (derives from RoleAssignment, which
// itself derives from tenant/sub-dept membership + department manager/access).
const roleScopeCache = createTtlCache<string[] | null>({
  name: "roleScope",
  ttlMs: ROLE_SCOPE_TTL_MS,
  maxSize: MAX_USERS,
  load: async (userId) => {
    const { resolveSubDepartmentTeamIds } = await import("@/lib/role-assignment");
    return resolveSubDepartmentTeamIds(userId);
  },
});

// Cache B — the set of tickets a user may see regardless of department scope:
// individual access grants, primary-assigned tickets, and co-assigned tickets.
const exceptionTicketIdsCache = createTtlCache<string[]>({
  name: "exceptionTicketIds",
  ttlMs: EXCEPTION_IDS_TTL_MS,
  maxSize: MAX_USERS,
  load: (userId) => loadExceptionTicketIds(userId),
});

async function loadExceptionTicketIds(userId: string): Promise<string[]> {
  const { prisma } = await import("@/lib/db");
  // Two indexed lookups instead of one OR + nested `assignees.some` — that
  // shape cannot use Ticket.assigneeId / TicketAssignee.userId and scanned
  // every assigned ticket on every tenant-scoped read (projects, settings,
  // calendar, mailboxes) for anyone who isn't a super admin. Do NOT collapse
  // this back into a relational predicate without benchmarking against real data.
  const [grants, assigned, coAssigned] = await Promise.all([
    prisma.ticketAccessGrant.findMany({ where: { userId }, select: { ticketId: true } }),
    runAsSystem(() =>
      prisma.ticket.findMany({
        where: { deletedAt: null, assigneeId: userId },
        select: { id: true },
      }),
    ),
    runAsSystem(() =>
      prisma.ticketAssignee.findMany({
        where: { userId, ticket: { deletedAt: null } },
        select: { ticketId: true },
      }),
    ),
  ]);
  return [
    ...new Set([
      ...grants.map((g) => g.ticketId),
      ...assigned.map((t) => t.id),
      ...coAssigned.map((a) => a.ticketId),
    ]),
  ];
}

/** Cache A read — the caller's sub-department team allowlist (null = unscoped). */
export function getCachedSubDepartmentTeamIds(userId: string): Promise<string[] | null> {
  return roleScopeCache.get(userId);
}

/** Cache B read — the caller's visibility-exception ticket IDs. */
export function getCachedExceptionTicketIds(userId: string): Promise<string[]> {
  return exceptionTicketIdsCache.get(userId);
}

/**
 * Drop a user's cached role/sub-department scope (Cache A). Call this after any
 * write that changes their role, tenant/sub-department membership, or department
 * manager/access grants. Cache B (exception ticket IDs) is TTL-only by design
 * and intentionally has no invalidation hook.
 */
export function invalidateUserScope(userId: string): void {
  roleScopeCache.invalidate(userId);
}

/**
 * Observability (Step 4): cumulative hit/miss/coalesce/eviction counters for
 * both scope caches on this instance. Read from a debug endpoint or log to
 * confirm the hit rate is high and the trio's per-request query volume dropped.
 */
export function scopeCacheStats() {
  return {
    roleScope: roleScopeCache.stats(),
    exceptionTicketIds: exceptionTicketIdsCache.stats(),
  };
}

/** Test-only: reset both caches between cases. */
export function __resetScopeCachesForTests(): void {
  roleScopeCache.clear();
  exceptionTicketIdsCache.clear();
}
