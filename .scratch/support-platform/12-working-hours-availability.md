# 12 — Working hours + availability + assignment exclusion

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Per-user working days/times/timezone (WH-01) and unavailability date ranges (WH-02). Automatic assignment excludes agents outside working hours or within an unavailability period (WH-03, ASG-04). Tickets already assigned to a now-unavailable user are flagged ("Waiting — agent unavailable") and the flag is filterable on the board (WH-04). A department-level default business calendar supports SLA calculation where no user hours apply (WH-05).

## Acceptance criteria
- [ ] Per-user working hours/timezone and unavailability ranges can be defined.
- [ ] Auto-assignment excludes out-of-hours and unavailable agents.
- [ ] Tickets held by a newly-unavailable agent are flagged and the flag is filterable.
- [ ] A department business calendar exists and feeds SLA calculation as fallback.

## Blocked by
- 11 — Assignment methods + failure handling
