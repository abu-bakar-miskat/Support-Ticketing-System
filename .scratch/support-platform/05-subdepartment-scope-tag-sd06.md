# 05 — Team→SubDepartment scope tag + SD-06 enforcement

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 2

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Map `Team` → `SubDepartment` as a ticket scope tag: tickets carry `sub_department_id` (nullable). A user may hold access at whole-department scope or at one-or-more specific sub-departments. Enforce SD-06 via the mandatory scope predicate at the repository/extension layer so that any ticket outside the caller's granted sub-department scope is excluded from **every** read path — board, list, search, filter, report, export, notification and API response. Sub-department manager defaults to the parent Department Admin where unassigned.

## Acceptance criteria
- [ ] Tickets can be tagged to a sub-department; department-scope tickets remain visible to whole-department users.
- [ ] A user granted only sub-department A never sees sub-department B tickets on any read path (explicit negative tests per surface).
- [ ] An unassigned sub-department resolves the parent Department Admin as effective manager for authz and notification.
- [ ] Sub-department access can be granted/revoked independently of whole-department access.

## Blocked by
- 04 — Department board + status-typed columns
