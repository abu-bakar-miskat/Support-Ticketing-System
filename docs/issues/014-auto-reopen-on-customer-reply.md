# 014 — Auto-reopen on reply to closed ticket

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 22,23

## What to build

Ensure a customer's reply to a resolved ticket re-enters the workflow instead of being missed. When a trusted inbound message arrives on a ticket currently in a completion `TeamStatus`, the ticket is appended-to and **auto-reopened** to the team's first non-completion status (by order). The reopen is signalled as part of the single `customer_reply` notification (not a second notification) and the message/activity records that it was reopened by a customer reply.

## Acceptance criteria

- [ ] A trusted reply to a ticket in a completion status moves it to the team's first `isComplete: false` status (by order)
- [ ] The inbound message is still appended to the thread
- [ ] Exactly one notification fires, conveying both the reply and the reopen
- [ ] The reopen is attributable to the customer reply in the activity/timeline
- [ ] Edge case: a ticket whose statuses are all completion statuses stays put and still notifies
- [ ] Unit test for reopen-target resolution over an ordered `TeamStatus` list; behavior test for the reopen path

## Blocked by

- 011 — Inbound receive & thread (trusted path)
