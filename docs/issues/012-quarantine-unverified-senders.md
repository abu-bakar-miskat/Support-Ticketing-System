# 012 — Quarantine unverified senders + accept flow

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 13,14,24

## What to build

Handle inbound messages whose sender does not match the intake submitter — the mitigation for a leaked or forwarded reply token (a bearer secret). A valid token with a mismatched `From` address is stored but **quarantined**: it is not rendered as the customer's own words until a human confirms it.

- Quarantined messages carry a distinct `status` and show an "⚠ unverified sender" treatment in the timeline.
- A `customer_reply_review` notification (worded "needs review") goes to the assignee and department manager instead of the trusted `customer_reply` notification.
- The ticket assignee or a department manager can **accept** a quarantined message, promoting it to trusted; the acceptor is recorded.
- Invalid/absent-token inbound is dropped and logged (not quarantined).

## Acceptance criteria

- [ ] Valid token + sender ≠ submitter email → message stored with quarantined status, not shown as trusted content
- [ ] Quarantined inbound fires `customer_reply_review` (assignee + manager), not `customer_reply`
- [ ] Assignee or department manager can accept a quarantined message; others cannot
- [ ] Accepting promotes the message to trusted and records the acceptor
- [ ] Invalid/absent token inbound is dropped and logged
- [ ] Unit tests for the trust decision (trusted / quarantine / drop); route test for the accept action and its permission gate

## Blocked by

- 011 — Inbound receive & thread (trusted path)
