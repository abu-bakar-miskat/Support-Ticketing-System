# 20 — Immutable AuditEvent log

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 4

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Append-only `AuditEvent(tenant_id, actor_id, action, target_type, target_id, before, after, occurred_at)`. Administrative and configuration actions (user, permission/RoleAssignment, SLA, rule, template, agreement, feature-flag changes) are recorded with actor, timestamp and before/after state (NFR-09). Records are immutable and not deletable through any application interface (DAT-05). Provide a Super-Admin/Project-Admin view scoped appropriately.

## Acceptance criteria
- [ ] Admin/config mutations write an AuditEvent with actor, timestamp and before/after.
- [ ] No application path can edit or delete an AuditEvent.
- [ ] Audit entries are viewable, scoped to the viewer's authority.
- [ ] Coverage includes user, permission, SLA, rule, template, agreement and feature-flag changes.

## Blocked by
- 03 — Authorization cutover + retire Profile.role
