# 19 — Per-tenant FeatureFlag

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 4

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
`FeatureFlag(tenant_id, feature_key, enabled)` and Super-Admin controls to enable/disable named platform features per tenant. A disabled feature is hidden in the UI **and** rejected at the API with HTTP 403 (SA-04).

## Acceptance criteria
- [ ] Super Admin can toggle named features per tenant.
- [ ] A disabled feature is hidden in the UI for that tenant.
- [ ] API requests to a disabled feature return HTTP 403 (server-side enforced, not UI-only).
- [ ] Flag changes are written to the audit log.

## Blocked by
- 03 — Authorization cutover + retire Profile.role
