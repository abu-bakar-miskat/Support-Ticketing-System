# 010 — Thread bootstrap + resolution fold-in

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 9,10,21

## What to build

Make the two existing one-shot customer emails part of the conversation thread, so the thread exists from the moment a ticket is created and stays coherent through resolution.

- **Bootstrap:** the intake-confirmation email becomes message #1 of the thread. It is sent with the token `Reply-To` (when the form allows replies) and logged as an outbound `TicketMessage`, so a customer's first reply already has a ticket and thread to land on.
- **Resolution fold-in:** the resolution email is routed through the same outbound `TicketMessage` pipeline as ordinary replies. The existing status→complete trigger and resolution-note capture are unchanged — only the send path changes — so the resolution becomes a normal, replyable message in the thread. No change to resolution UX.

## Acceptance criteria

- [ ] Converting an intake sends the confirmation email with the token `Reply-To` and records it as the first outbound `TicketMessage`
- [ ] Confirmation is omitted/token-less when the form disallows customer replies or receiving is disabled
- [ ] The resolution email is sent through the outbound `TicketMessage` pipeline and appears in the timeline as a customer-facing message
- [ ] Resolution trigger, resolution-note capture, and UI are unchanged
- [ ] Both messages carry the same thread token so replies route to the ticket
- [ ] Route/unit tests: confirmation logged on conversion; resolution send produces a `TicketMessage` with token `Reply-To`

## Blocked by

- 009 — Outbound customer reply foundation
