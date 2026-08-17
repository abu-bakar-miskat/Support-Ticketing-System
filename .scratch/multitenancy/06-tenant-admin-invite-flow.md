# 06 — Tenant-admin invite flow

**Type:** AFK
**Triage:** ready-for-agent

## What to build

Let a tenant-admin (or super-admin) grant existing or new users access to their tenant, reusing the existing department invite shape one level up.

- Tenant-admin invites an email with a role → creates a `TenantInvite`.
- Accepting the invite (at the existing `/invite` flow, extended for tenant scope) creates/attaches a `TenantMembership`.
- An email accepting invites from multiple tenants gains multi-tenant access and sees the tenant switcher from 05.

## Acceptance criteria

- [ ] Tenant-admin can invite an email into their own tenant with a role; cannot invite into other tenants.
- [ ] Accepting a valid, unexpired invite creates a `TenantMembership`; expired/invalid tokens are rejected.
- [ ] An existing user accepting a second tenant's invite ends up with memberships in both and a working switcher.
- [ ] A brand-new email accepting an invite is onboarded into the tenant.
- [ ] Tests: cross-tenant invite blocked, expiry, multi-tenant accumulation.

## Blocked by

- 05 — Super-admin console: create & switch tenants
