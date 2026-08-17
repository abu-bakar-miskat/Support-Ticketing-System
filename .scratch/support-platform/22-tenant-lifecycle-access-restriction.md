# 22 — Tenant lifecycle + access restriction

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 4

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Super-Admin tenant lifecycle: create, edit, suspend and **soft-delete** tenants (SA-01, DAT-01). A suspended tenant's users are denied authentication with an explanatory message; data is retained intact (SA-01). Restrict or re-enable access at tenant level or for an individual user without data deletion; restriction takes effect on the next request and active sessions are invalidated within 60 seconds (SA-03).

HITL: session-invalidation approach + soft-delete semantics review.

## Acceptance criteria
- [ ] Create/edit/suspend/soft-delete tenants; soft-delete never removes data.
- [ ] Suspended tenant users are denied login with an explanatory message; their data remains intact.
- [ ] Tenant- or user-level access restriction takes effect on the next request and invalidates active sessions within 60s.
- [ ] Re-enabling restores access without data loss.

## Blocked by
- 03 — Authorization cutover + retire Profile.role
