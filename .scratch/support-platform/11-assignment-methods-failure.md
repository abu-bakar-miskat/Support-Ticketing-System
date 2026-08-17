# 11 — Assignment methods + failure handling

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Four per-department assignment methods (ASG-01): rule-based, round-robin, workload-based (lowest current open-ticket count), and manual. Where automatic assignment finds no eligible agent, leave the ticket unassigned, mark it `ASSIGNMENT_FAILED`, and notify the Department Admin immediately — no ticket is silently unrouted (ASG-02/03).

## Acceptance criteria
- [ ] Each of the four methods assigns correctly for a department configured to use it.
- [ ] Round-robin advances fairly; workload-based picks the lowest open-ticket agent.
- [ ] No eligible agent → ticket unassigned + ASSIGNMENT_FAILED + immediate Department Admin notification.
- [ ] Assignment outcomes emit structured logs (NFR-11).

## Blocked by
- 04 — Department board + status-typed columns
