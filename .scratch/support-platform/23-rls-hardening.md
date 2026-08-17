# 23 — RLS hardening (non-owner role + per-request GUC)

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 4

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Defence-in-depth for isolation (D-02, C-01): connect Prisma as a non-owner DB role subject to RLS, set a per-request tenant/scope GUC, and add Postgres RLS policies keyed on the tenant (and scope where feasible) so a deliberately un-guarded query still returns no cross-tenant rows. Complements — does not replace — the mandatory Prisma scope extension (issue 02). Migration follows the additive shared-DB workflow in AGENTS.md.

## Acceptance criteria
- [ ] A non-owner Prisma role exists and is used for tenant-scoped access; service-role bypass paths are explicit and preserved.
- [ ] A per-request tenant/scope GUC is set from the resolved caller scope.
- [ ] RLS policies deny cross-tenant rows even when an app-layer clause is omitted (verified by a deliberately un-guarded query test).
- [ ] Migration is additive and applied to the dev DB first per AGENTS.md.

## Blocked by
- 02 — Non-bypassable Prisma scope extension + CI cross-tenant negative tests
