# 10 — SLA policies + timers + indicator

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Per-department SLA policies whose applicability is conditioned on form field values; where multiple match, the most restrictive target wins (SLA-01/02). Separate first-response and resolution timers start at ticket creation; first-response stops on the first PUBLIC agent message (SLA-03). A per-department setting controls whether timers pause outside working hours or run continuously (SLA-04); a department business calendar is the fallback where no user hours apply (WH-05). At-risk (default 80%) and breach notifications (SLA-05); ticket shows an SLA indicator ON_TRACK/AT_RISK/BREACHED with remaining/overdue time (SLA-06). Breach history is immutable (SLA-07). On reopen, the resolution timer resumes and a fresh first-response timer starts (OQ-03); keep restart/resume/fresh reachable without schema change.

## Acceptance criteria
- [ ] Policy matching on form values selects the most restrictive target on overlap.
- [ ] First-response and resolution timers start at creation; first-response stops on first PUBLIC agent message.
- [ ] Per-department pause-outside-hours setting is honored; business calendar used as fallback.
- [ ] At-risk and breach notifications fire; indicator shows ON_TRACK/AT_RISK/BREACHED + remaining/overdue.
- [ ] Reopen resumes resolution + starts fresh first-response; breach history is never reset/deleted.
- [ ] Timer logic is tested via an injected clock (no wall-clock dependence).

## Blocked by
- 04 — Department board + status-typed columns
- 07 — Sub-status + reopen/escalate behavior
- 08 — Dynamic forms: versioned fields + conditional visibility + public URL
