# 17 — Board filtering & search

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Filter board tickets by assignee (including "unassigned"), status, sub-status, priority, date range, and the value of any custom form field belonging to that department (FLT-01/02/04). Free-text search across ticket subject, reference, requester email and message body, scoped to the user's permitted tickets (FLT-03). Applied filters are reflected in the URL so a filtered view is bookmarkable/shareable; a recipient sees only tickets within their own scope (FLT-05). All filtering/search respects sub-department scope (SD-06).

## Acceptance criteria
- [ ] Filter by assignee/unassigned, status, sub-status, priority, date range, and custom form field values.
- [ ] Free-text search across subject/reference/requester email/message body, scoped to permitted tickets only.
- [ ] Filters serialize to the URL; a shared URL shows the recipient only their in-scope tickets.
- [ ] No filter/search path can surface out-of-scope or out-of-sub-department tickets.

## Blocked by
- 05 — Team→SubDepartment scope tag + SD-06 enforcement
- 08 — Dynamic forms: versioned fields + conditional visibility + public URL
