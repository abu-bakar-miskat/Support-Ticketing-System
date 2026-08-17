# 03 — Authorization cutover + retire `Profile.role` as authz signal

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 1

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Migrate every remaining server-side authorization decision (route guards, dept-scope helpers, ticket access) to the RoleAssignment resolver + scope extension. Retire `Profile.role` as an authorization signal (it may remain a display hint only). Ensure every list/read endpoint is scope-filtered and every out-of-scope resource returns 404.

## Acceptance criteria
- [ ] No route/handler makes an authz decision from `Profile.role`; all decisions come from the resolver.
- [ ] All tenant/department-scoped list endpoints are filtered via the extension (no hand-written scope `where` clauses remain as the sole control).
- [ ] Cross-tenant and cross-department negative tests pass across the audited routes.
- [ ] Existing per-role behavior (admin/manager/lead/staff, super-admin) is preserved via RoleAssignment.

## Blocked by
- 02 — Non-bypassable Prisma scope extension + CI cross-tenant negative tests
