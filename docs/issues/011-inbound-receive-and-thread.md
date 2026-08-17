# 011 — Inbound receive & thread (trusted path)

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 5,6,7,11,12,16,26

## What to build

Capture a customer's email reply and thread it into the originating ticket — the inbound trunk of the feature. This slice covers the **trusted** path (sender matches the intake submitter); mismatch/quarantine is issue 012.

A public webhook endpoint receives Resend `email.received` events. Because Resend webhooks are **metadata-only**, the handler: verifies the svix signature, performs an idempotency insert keyed on the event id and `Message-ID`, returns `200` immediately, then in a post-response task fetches the full email via Resend's retrieval API, matches it to a ticket, and persists an inbound `TicketMessage`.

Matching: primary by token as the entire local part of the recipient address (`reply-<token>@<inbound-domain>`); fallback by `In-Reply-To`/`References` against stored outbound `messageId`s.

Content: prefer the `text/plain` part; fall back to HTML only when plain is absent and then strictly sanitize (remove scripts, styles, event handlers, remote images) — never reuse the raw-HTML render path used for intake responses. Quote/signature history is stripped for the default view (hand-rolled heuristic) with the raw payload preserved for a "show quoted text" expander.

On a trusted inbound message, fire a `customer_reply` notification to the assignee, falling back to the department manager / ticket creator when the ticket is unassigned (in-app always; email respects existing per-user prefs).

## Acceptance criteria

- [ ] A signed `email.received` webhook is accepted; an unsigned/invalid one is rejected
- [ ] A redelivered event does not create a duplicate `TicketMessage` (idempotent on event id + `Message-ID`)
- [ ] Endpoint returns `200` promptly; email + content retrieval happens in a post-response task
- [ ] A reply to the token address routes to the correct ticket and creates an inbound `TicketMessage`
- [ ] Header-fallback matching routes a fresh (non-reply) email carrying valid threading headers
- [ ] `text/plain` is preferred; HTML fallback is sanitized (scripts/handlers/remote images stripped)
- [ ] Quoted history/signature collapsed by default; raw preserved for expansion
- [ ] Trusted inbound fires `customer_reply` to assignee, or manager/creator when unassigned
- [ ] Unit tests: token extraction, header-fallback matching, quote stripping, HTML sanitization. Route tests: svix rejection, idempotent redelivery, token→ticket match

## Blocked by

- 009 — Outbound customer reply foundation
