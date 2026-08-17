# 01 — Tenant data model + backfill foundation

**Type:** HITL
**Triage:** ready-for-human

## What to build

Introduce the `Tenant` concept as the new parent above `Department`, and migrate the entire existing system into a single seed tenant ("PEN") with zero behavior change for current users.

New models:
- `Tenant` — org boundary (`slug` unique, `name`, `status`).
- `TenantMembership` — grants a `Profile` access to a `Tenant` with a role (tenant-admin / member); a user may hold many. Mirrors the existing `DepartmentAccess` pattern one level up.
- `TenantInvite` — pending invite by email into a tenant with a role + expiry. Mirrors `DepartmentInvite`.

Changes to existing models:
- `Department` gains a required `tenantId` — the linchpin, since nearly all scoped data roots to a department.
- `Profile` gains `isSuperAdmin` (platform role, orthogonal to tenant role). Email stays globally unique (one identity).
- Denormalize `tenantId` onto the hot, directly-queried tables — `Team`, `Project`, `Ticket` — as a defense-in-depth backstop, because queries filter by `teamId`/`projectId` directly rather than always through `Department`.

This is HITL: it is an architectural decision AND requires the shared-DB migration workflow in `AGENTS.md` (additive-only, hand-edited SQL via `migrate diff` → review → `db execute` → `migrate resolve`; never `migrate dev`/`reset`).

Backfill sequence:
1. Add nullable `tenantId` columns + new tables.
2. Create one `Tenant` "PEN"; set `tenantId` on every existing `Department`/`Team`/`Project`/`Ticket` to it; create a `TenantMembership` for every existing `Profile`; mark the platform owner `isSuperAdmin`.
3. Flip `tenantId` to `NOT NULL` on `Department` (+ denormalized tables) once backfill is verified.

## Acceptance criteria

- [ ] `Tenant`, `TenantMembership`, `TenantInvite` models exist with relations and unique constraints (`Tenant.slug`, `(profileId, tenantId)`).
- [ ] `Department.tenantId`, `Profile.isSuperAdmin`, and denormalized `Team/Project/Ticket.tenantId` exist.
- [ ] Migration is additive-only (no DROP), hand-reviewed, applied to the shared DB, and recorded via `migrate resolve`; `prisma generate` reflects it.
- [ ] All existing rows are backfilled into the "PEN" tenant; every existing profile has a membership; one profile is super-admin.
- [ ] `tenantId` is `NOT NULL` on `Department` (+ denormalized tables) after backfill.
- [ ] No behavior change for existing users — current department scoping still works.

## Blocked by

None - can start immediately.
