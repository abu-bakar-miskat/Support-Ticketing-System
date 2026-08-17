# 18 — Reporting: dept + custom + cross-dept dashboard + export

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Per-department reports: ticket volume by type/category (RPT-01) and resolution time by priority (mean and median, RPT-02), runnable over a date range compared to the preceding equivalent range (RPT-03). Custom reports grouped/filtered by that department's own form fields (RPT-04). Project Admin cross-department visibility via a live dashboard and scheduled exportable reports aggregated across departments, containing no ticket message content (RPT-06) — cross-department category aggregation uses the standard category taxonomy (D-08). Export any report to CSV and PDF; exports over a threshold generate asynchronously and deliver by download link (RPT-05). All reporting respects the requester's department/sub-department scope (RPT-07).

## Acceptance criteria
- [ ] Volume-by-category and resolution-by-priority (mean/median) with date-range vs preceding-range comparison.
- [ ] Custom reports group/filter by department form fields.
- [ ] Project Admin sees a cross-department dashboard + scheduled exports with no message content.
- [ ] CSV + PDF export; large exports run async and deliver by link.
- [ ] Every reporting query respects department/sub-department scope.

## Blocked by
- 03 — Authorization cutover + retire Profile.role
- 08 — Dynamic forms: versioned fields + conditional visibility + public URL
- 10 — SLA policies + timers + indicator
