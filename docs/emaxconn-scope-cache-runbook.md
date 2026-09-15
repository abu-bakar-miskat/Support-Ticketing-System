# EMAXCONN / scope-cache runbook (Steps 4–6)

Operational guide for the authorization-scope caching work that reduced the
`EMAXCONN` pooler contention. Steps 1–3 (the code) are done; Steps 4–6 are the
measure → benchmark → capacity decisions, which need real traffic/data.

## Background (one paragraph)

The `EMAXCONN` storm came from the per-request ticket-access resolver — the
`TicketAccessGrant` + `TicketAssignee` + `RoleAssignment` trio — re-running on
every concurrent ticket request against a size-1 pg pool behind a shared
Supavisor client cap. The trio only fires for **Ticket-model queries by
non-super-admins without ambient scope**. Fixes shipped: cross-request scope
cache (`lib/scope-cache` + `lib/ttl-cache`), a `runWithScope` route wrapper
(`lib/authenticated-route`), and admin write routes now maintain the canonical
`RoleAssignment` so grants take effect immediately.

## Step 4 — Measure after deploy

**Primary signal:** the `[db] EMAXCONN on … — backing off …` log lines
(`lib/db.ts`). Track their **rate**; the goal is near-zero.

**Cache instrumentation:** `scopeCacheStats()` (`lib/scope-cache.ts`) returns
cumulative counters for both caches:

| Field | Watch for |
|---|---|
| `hits` / `misses` | hit rate should be high once warm; a low rate on `roleScope` means keys churn faster than the 15s TTL |
| `coalesced` | > 0 confirms single-flight is collapsing concurrent misses (the point of the cache under bursts) |
| `evictions` | consistently rising → `MAX_USERS` (5000) is too small for active-user count; raise it |
| `size` | current distinct cached users |

To expose it, read `scopeCacheStats()` from a super-admin-gated debug endpoint or
log it periodically. **Do not expose it unauthenticated** — it leaks user counts.

**Also worth capturing** (if you have query/APM tooling): permission queries per
request (should drop sharply), pool checkout wait time, and
scope-resolution p50/p95/p99.

**Correctness checks** (already verified manually once): grant a non-admin a
department-manager/access role → their scope updates on the next request without
re-login; revoke → it's gone. `RoleAssignment` rows appear/disappear immediately.

## Step 5 — Benchmark SQL shapes

Run `npx tsx scripts/bench-scope-resolution.ts <userId> [iterations]` against a
**production-like** dataset. It compares Shape A (current 3 indexed lookups) vs
Shape B (single relational-OR query) with wall-clock medians **and**
`EXPLAIN ANALYZE` plans. Read-only.

**Decision rule:** keep Shape A (the current flat-ID design) unless Shape B is
clearly faster on production-scale data **AND** its plan uses the
`userId`/`assigneeId` indexes (no `Seq Scan` on `Ticket`) **AND** cross-tenant
security tests still pass. The repo previously reverted Shape B because it
scanned every assigned ticket — treat that as the prior and demand evidence.

## Step 6 — Reconsider connection capacity

Do **not** raise `DB_POOL_MAX` (default 1) until Step 4 shows demand has fallen
and `EMAXCONN` is *still* non-trivial. `EMAXCONN` is a **shared** Supavisor
client cap — raising the per-instance pool consumes the shared budget faster and
can hurt teammates/other instances.

**If capacity is genuinely needed:**
1. First reduce demand (confirm cache hit rate is high, scope resolved once per
   request via the wrapper on hot routes).
2. Prefer raising **Supavisor's pool size / `max_client_connections`** on the
   Supabase side (the shared cap) over bumping `DB_POOL_MAX` locally.
3. Only raise `DB_POOL_MAX` after checking the project's current
   client-connection budget and peak instance count (per `lib/db.ts:78`).

## Status

- Steps 1–3: done, in working tree (uncommitted).
- Step 4: instrumentation shipped (`scopeCacheStats()`); interpretation needs
  live traffic.
- Step 5: benchmark script shipped; run against real data to decide.
- Step 6: gated on Step 4 — no change made, criteria documented above.
