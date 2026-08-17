# 02 — Non-bypassable Prisma scope extension + CI cross-tenant negative tests

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 1

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
A Prisma client extension that injects the caller's tenant + scope predicate into every query so no call site can omit it (D-02, C-01). Wire the ticket read/write paths through the extended client first. Out-of-scope resources return **404, not 403** (API-04). Add CI cross-tenant negative tests (NFR-01): a caller scoped to tenant A must never observe tenant B's rows on any read path.

## Acceptance criteria
- [ ] Queries through the extended client are automatically scope-filtered by the active caller's scope; a query that omits an explicit `where` still cannot return out-of-scope rows.
- [ ] Ticket fetch/list for a resource outside the caller's tenant returns 404 (not 403).
- [ ] CI negative tests assert cross-tenant isolation on ticket read paths and fail if isolation regresses.
- [ ] Service-role/system paths that must bypass scoping are explicit and documented.

## Blocked by
- 01 — RoleAssignment model + scope-chain resolver
