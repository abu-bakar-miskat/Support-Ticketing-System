# 015 — Auto-reply detection + inbound rate-limiting

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 15,29

## What to build

Protect staff from machine-generated noise and notification floods on the inbound path.

- **Auto-reply detection:** inbound messages bearing `Auto-Submitted: auto-replied`, `X-Autoreply`, or `Precedence: bulk` are marked as system and kept out of the main conversation feed (no `customer_reply` notification).
- **Rate-limiting:** a soft per-thread cap (~20 inbound/hour) — messages beyond the cap are still stored, but notifications are suppressed and the burst is flagged, so an auto-responder loop cannot bury the assignee.

## Acceptance criteria

- [ ] Messages with auto-reply headers are marked system and excluded from the main feed and from notifications
- [ ] Beyond the per-thread hourly cap, inbound messages are stored but notifications are suppressed
- [ ] Over-cap bursts are flagged so staff can see volume was throttled
- [ ] Normal-volume threads are unaffected
- [ ] Unit tests for auto-reply header detection and for the rate-limit decision

## Blocked by

- 011 — Inbound receive & thread (trusted path)
