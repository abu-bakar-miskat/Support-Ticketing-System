# 04 — Department board + status-typed columns

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 2

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Move the board to the **department** level (one board per department, auto-created at department creation). Each `BoardColumn` carries an immutable `status_type` ∈ {OPEN, PAUSED, ESCALATED, RESOLVED}. Seed the five defaults (To Do/In Progress/On Hold/Escalated/Done → OPEN/OPEN/PAUSED/ESCALATED/RESOLVED). Support add/rename/reorder/delete-with-move; renaming never changes the status_type. Migrate existing per-team `TeamStatus` into department `BoardColumn`s. All logic keys on status_type, never the display name (C-03).

HITL: schema migration + the TeamStatus→BoardColumn mapping decision.

## Acceptance criteria
- [ ] Creating a department atomically creates its board with the five default status-typed columns.
- [ ] A column's status_type is immutable once it holds tickets (DAT-02); renaming leaves status_type unchanged.
- [ ] Adding a column requires choosing one of the four status types; columns can be reordered; deleting a column with tickets is blocked unless a destination column is chosen.
- [ ] A ticket always references exactly one column of its own department's board (DAT-03).
- [ ] Existing team statuses are migrated to department board columns with correct status types.

## Blocked by
- 03 — Authorization cutover + retire Profile.role
