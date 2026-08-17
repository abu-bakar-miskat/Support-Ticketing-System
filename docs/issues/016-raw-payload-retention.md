# 016 — Raw payload retention (90-day TTL)

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers story 30

## What to build

Minimise stored personal data. The sanitized display body of a `TicketMessage` is kept permanently, but the raw inbound payload (full email + headers, retained for audit/debugging) is purged after a 90-day retention window.

## Acceptance criteria

- [ ] Raw payloads older than 90 days are purged on a schedule; display bodies are retained
- [ ] Purge is idempotent and safe to re-run
- [ ] A purged message still renders its display body and metadata in the timeline
- [ ] Test covering the purge selection boundary (just-under vs just-over 90 days)

## Blocked by

- 011 — Inbound receive & thread (trusted path)
