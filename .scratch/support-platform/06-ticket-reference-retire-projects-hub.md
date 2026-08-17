# 06 — Ticket identity: per-department reference; retire Projects & hub

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 2

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Replace per-team ticket numbering with a stable **per-department reference** (department-scoped counter). Retire Projects/Sprints/Modules from the Support experience: hide them from the UI and stop tagging tickets with `projectId` (keep the tables deprecated — no data loss). Remove the hub concept (`isHub`/`buildHubScope`); cross-department visibility is provided only by Project Admin reporting (D-05, D-07).

HITL: reference/numbering migration + confirming Project/hub retirement scope.

## Acceptance criteria
- [ ] New tickets receive a per-department reference; existing tickets remain resolvable.
- [ ] Support UI no longer surfaces Projects/Sprints/Modules; ticket creation no longer requires/sets projectId.
- [ ] `isHub`/hub scoping is removed from scope resolution; no member gets cross-department board access via hub.
- [ ] Deprecated project tables retained (no destructive drop) and untouched by Support flows.

## Blocked by
- 04 — Department board + status-typed columns
