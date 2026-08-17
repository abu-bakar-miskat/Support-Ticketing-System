# 15 — Department settings: branding + senders + notification templates + setup walkthrough

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Per-department logo + colour scheme applied to customer-facing email/forms (DS-01). One or more sender/reply-to addresses with a designated default (DS-02). Editable notification templates per lifecycle event (TICKET_RAISED, STATUS_CHANGED, REPLY_RECEIVED, TICKET_RESOLVED) with placeholder-token substitution at send time — unresolved tokens render empty, never raw token text (DS-03/04). Each template can define its own footer, falling back to an editable platform/tenant default when none is set (DS-05/06, OQ-02). New-department setup: block operational use until the initial setup review is completed (DS-08); a newly-assigned manager of an already-active department gets a non-blocking dismissible overview instead (DS-09); the walkthrough is available on demand at any step (DS-10).

## Acceptance criteria
- [ ] Department branding (logo/colours) applies to customer-facing email and forms.
- [ ] Multiple sender/reply-to addresses with one default; outbound uses the default unless overridden.
- [ ] Notification templates per event with token substitution; unresolved tokens render as empty strings.
- [ ] Template footer with editable platform/tenant default fallback.
- [ ] New department blocks operational use until setup review complete; existing-department new manager gets a non-blocking overview; walkthrough re-openable on demand.

## Blocked by
- 04 — Department board + status-typed columns
