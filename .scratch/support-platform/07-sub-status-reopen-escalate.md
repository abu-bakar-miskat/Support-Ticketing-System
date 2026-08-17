# 07 — Sub-status + reopen/escalate behavior

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 2

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Derive a ticket's sub-status from the last customer-visible message: `WAITING_FOR_SUPPORT` when the last PUBLIC message was the customer, `WAITING_FOR_CUSTOMER` when it was an agent; INTERNAL notes are excluded (BD-07). Escalation to an ESCALATED column happens only by explicit user action — any agent may escalate for now (OQ-04); SLA breach never changes a column (BD-08). On a customer reply to a RESOLVED ticket, move it to the board's first OPEN column, apply a `Reopened` label (auto-clearing on the next agent reply, OQ-05), and append to the same feed (BD-09).

## Acceptance criteria
- [ ] Sub-status updates correctly from the last PUBLIC message author; internal notes never affect it.
- [ ] Moving to ESCALATED requires explicit action; SLA breach does not move columns.
- [ ] A customer reply to a resolved ticket reopens it into the first OPEN column with a Reopened label and appends to the feed.
- [ ] The Reopened label auto-clears when an agent next replies.

## Blocked by
- 04 — Department board + status-typed columns
- 05 — Team→SubDepartment scope tag + SD-06 enforcement
