# 16 — Comments feed: internal/reply + attachments + @mention

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
A single chronological feed per ticket of customer messages, agent replies and internal notes (CM-01). The author must choose Internal Note or Reply before posting; a Reply is dispatched to the customer using the department's REPLY_RECEIVED template + branding, and internal note content is never included in any outbound customer email (CM-02/03). Rich text + file attachments on comments, ≤25 MB per attachment with a MIME allowlist (images, PDF, office, text/CSV, zip) and executables blocked (CM-04, OQ-08). @mention a colleague within an internal note, notifying them, restricted to users with access to that ticket's scope (CM-05).

## Acceptance criteria
- [ ] One feed shows customer messages, replies and internal notes in order, visually distinguished.
- [ ] Reply emails the customer via the department template/branding; internal note content never appears in outbound mail.
- [ ] Attachments enforce the 25 MB cap and MIME allowlist; executables are rejected.
- [ ] @mention notifies only users with access to the ticket's scope.

## Blocked by
- 05 — Team→SubDepartment scope tag + SD-06 enforcement
- 14 — MailboxConnection intake + threading + suppression
