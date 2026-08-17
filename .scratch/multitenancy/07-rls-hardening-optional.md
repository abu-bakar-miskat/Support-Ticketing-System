# 07 — (Optional) RLS hardening

**Type:** HITL
**Triage:** ready-for-human

## What to build

A database-level safety net so tenant isolation does not depend solely on application code. Today Prisma connects as the table owner and bypasses RLS, so existing `ENABLE RLS` statements are inert for data access.

- Connect Prisma as a non-owner role that is subject to RLS.
- Set a per-request `app.current_tenant` GUC (e.g. `SET LOCAL`) from the resolved active tenant.
- Add RLS policies keyed on `tenantId` for the denormalized tables (and department-rooted tables as feasible).

HITL: touches DB roles/connection strings on the shared Supabase DB and needs careful review to avoid breaking existing service-role access. Deferred — ship after app-layer enforcement (03/04) is proven.

## Acceptance criteria

- [ ] A non-owner Prisma role exists and is used for tenant-scoped access; service-role paths that must bypass RLS are identified and preserved.
- [ ] `app.current_tenant` is set per request from the active tenant.
- [ ] RLS policies on `tenantId`-bearing tables deny cross-tenant rows even if an app-layer clause is missing.
- [ ] Verified: a deliberately un-guarded query still returns no cross-tenant rows under the non-owner role.
- [ ] Migration follows the additive shared-DB workflow in `AGENTS.md`.

## Blocked by

- 03 — Tenant guard on all data queries
- 04 — Ticket access tenant gate
