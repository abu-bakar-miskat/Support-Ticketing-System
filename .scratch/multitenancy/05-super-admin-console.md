# 05 — Super-admin console: create & switch tenants

**Type:** HITL
**Triage:** ready-for-human

## What to build

The first true end-to-end demoable slice: a super-admin can create a new, fully isolated tenant and move between tenants.

- Super-admin-only screen to create a tenant: creates the `Tenant`, seeds a default `Department`, and issues a first tenant-admin `TenantInvite`.
- List of all tenants (super-admin only).
- Tenant switcher (shown to super-admins and multi-tenant users) that sets `pen_active_tenant` and resets `pen_active_dept` atomically.

HITL because it needs design/UX review for the console and switcher, and confirmation of the tenant-seeding defaults.

## Acceptance criteria

- [ ] Super-admin can create a tenant; a default department is seeded and a first-admin invite is issued.
- [ ] Non-super-admins cannot see or reach the console (route + API guarded).
- [ ] Tenant list shows all tenants to super-admins only.
- [ ] Switcher sets active tenant and resets active department in one action; UI immediately reflects the new tenant's data.
- [ ] Creating a second tenant and adding data proves isolation from "PEN" (guards from 03/04 hold).

## Blocked by

- 02 — Active-tenant session + scope resolution
- (functional once 03 and 04 land)
