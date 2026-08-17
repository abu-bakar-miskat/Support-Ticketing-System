# 013 — Message attachments (both directions)

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 17,18,19,20

## What to build

Let files travel in both directions on a customer conversation.

- **Inbound:** attachments referenced by an `email.received` event are fetched via Resend's attachments API, stored to Supabase Storage, and linked to the `TicketMessage` via the attachment message reference. Enforce a per-file size cap (align with the existing intake upload limit). Executable/script types are blocklisted: stored and flagged "blocked type" (not downloadable inline), not silently dropped. Non-image types get no inline preview.
- **Outbound:** staff can attach files to a customer reply via the existing upload flow; they are sent to the customer as email attachments, respecting the provider total-size limit.

## Acceptance criteria

- [ ] Inbound attachments are fetched and stored against the inbound `TicketMessage`, downloadable from the timeline
- [ ] Files over the per-file cap are rejected
- [ ] Executable/script types are stored + flagged "blocked type" and not offered for inline download
- [ ] Non-image attachments render without inline preview
- [ ] Staff can attach files to an outbound reply; they arrive as email attachments and respect the total-size limit
- [ ] Tests for the blocklist/size-cap decision and for outbound attachment wiring

## Blocked by

- 011 — Inbound receive & thread (trusted path)
