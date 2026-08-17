# 02 — Active-tenant session + scope resolution

**Type:** AFK
**Triage:** ready-for-agent

## What to build

Make every authenticated request carry a validated *active tenant*, resolved before any department scoping. This is the enforcement spine the query guards build on.

- `getProfile()` additionally loads the user's `TenantMembership` rows and `isSuperAdmin`, exposing `tenantIds`, `activeTenantId`, and `isSuperAdmin` on the enriched profile.
- New `pen_active_tenant` cookie (httpOnly, same shape/expiry as `pen_active_dept`), set on login to the user's only/primary tenant.
- `assertTenantAccess(profile, tenantId)` — passes if the profile has a membership for that tenant, or is super-admin. Super-admin may target any tenant.
- `getProfileDeptScope` resolves `activeTenantId` first, then constrains department resolution to departments within that tenant. Switching tenant resets `pen_active_dept`.

## Acceptance criteria

- [ ] Enriched profile exposes `tenantIds`, `activeTenantId`, `isSuperAdmin`.
- [ ] `pen_active_tenant` cookie is set on login and validated on read (falls back to primary membership if invalid).
- [ ] `assertTenantAccess` allows members + super-admins and rejects others.
- [ ] `getProfileDeptScope` only ever returns departments belonging to the active tenant.
- [ ] Switching active tenant clears/resets `pen_active_dept`.
- [ ] Tests cover: member access, non-member rejection, super-admin any-tenant, invalid-cookie fallback.

## Blocked by

- 01 — Tenant data model + backfill foundation
