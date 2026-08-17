# 01 — RoleAssignment model + scope-chain resolver

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 1

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Introduce the canonical `RoleAssignment(userId, role, scopeType ∈ {PLATFORM, TENANT, DEPARTMENT, SUB_DEPARTMENT}, scopeId)` as the single source of truth for authorization, and a scope-chain resolver that, for a given user, computes their effective scope (tenant → department → sub-department). Backfill it from the existing role sources (`isSuperAdmin`, `TenantMembership`, `DepartmentManager`, `DepartmentMember`, `DepartmentAccess`, `TeamMembership`) so no access changes for current users. Switch the first consumer — the department-access decision (who may enter/see which departments) — to read from the resolver.

HITL: schema migration on the shared DB (additive, dev-DB first per AGENTS.md) plus the role-mapping decisions from `docs/requirements.md` §10 (D-06).

## Acceptance criteria
- [ ] `RoleAssignment` model exists with the four scope types and a unique constraint on (userId, role, scopeType, scopeId).
- [ ] Backfill migration populates RoleAssignment from all existing role tables with no effective access change.
- [ ] A scope-chain resolver returns a user's platform/tenant/department/sub-department scope and is unit-tested.
- [ ] The department-access decision uses the resolver (not the legacy tables) and its behavior is unchanged for existing users.
- [ ] Migration is additive (no drops), applied to the dev DB, and `prisma generate` reflects it.

## Blocked by
None - can start immediately.
