# 13 — Bulk reassignment + ticket transfer

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Bulk-reassign a selected agent's tickets to a single agent, a defined group, or the department pool, executed asynchronously with a progress and result summary (ASG-05, idempotent per C-05). Allow an agent to transfer a ticket to another department or sub-department, retaining the transferring user's read access for progress tracking and recording the transfer in ticket history (ASG-06).

## Acceptance criteria
- [ ] Bulk reassignment runs asynchronously with progress + result summary and is idempotent on retry.
- [ ] Transfer moves a ticket to another department/sub-department and records it in history.
- [ ] The transferring user retains read access to the transferred ticket.
- [ ] Transferred tickets respect the destination scope for everyone else (SD-06).

## Blocked by
- 05 — Team→SubDepartment scope tag + SD-06 enforcement
- 11 — Assignment methods + failure handling
