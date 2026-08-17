# 04 — Ticket access tenant gate

**Type:** AFK
**Triage:** ready-for-agent

## What to build

Extend the ticket-level authorization functions so tenant membership is a hard boundary above all existing checks — a ticket outside the active tenant is invisible even to direct participants (assignee/creator/co-assignee), who would switch tenants first.

- `canAccessTicket`, `assertTicketAccess`, and `assertTicketEditAccess` gain a top-level tenant gate as their first check, before draft/participant/manager/dept-scope logic.
- Super-admins are gated by their active tenant like anyone else (they switch tenant to act), not given implicit global ticket read.

## Acceptance criteria

- [ ] All three ticket-access functions reject tickets whose tenant ≠ active tenant, before any other rule.
- [ ] A direct participant (assignee/creator/co-assignee) cannot read/edit a ticket while their active tenant differs from the ticket's tenant.
- [ ] Existing intra-tenant access behavior (drafts, managers, dept scope) is unchanged.
- [ ] Tests: cross-tenant participant denied; same-tenant participant allowed; super-admin allowed only within active tenant.

## Blocked by

- 02 — Active-tenant session + scope resolution
