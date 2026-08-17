# 009 — Outbound customer reply foundation

> Type: AFK · Parent: docs/prd-customer-reply.md · Covers stories 1,2,3,4,7,8,25,27,28,31

## What to build

The first end-to-end slice of "Reply to customer": support staff can send an email to the intake submitter from a dedicated composer on an intake-originated ticket, and that message appears in the ticket timeline. Inbound handling comes later — this slice is send-only, but complete through every layer.

Introduces the shared domain foundation the rest of the feature builds on:
- A new `TicketMessage` entity, deliberately separate from `Comment` (separation is the leak-prevention property). Fields: ticket reference, `direction` (inbound/outbound), nullable author profile (null = customer), sender name/email, sanitized display body, raw payload (audit), provider `messageId`, `inReplyTo`, trust `status` (trusted/quarantined), quarantine-acceptor reference, timestamps.
- `Intake.replyToken` — opaque unguessable secret, generated for new intakes during conversion **and backfilled for all existing intakes** in the same migration.
- `IntakeFormConfig.allowCustomerReplies` (default true).
- `Attachment` gains a nullable message reference.

The composer is visually separate from the internal comment box and shows the customer's email as recipient. Sends go out from the agent's display name over a shared support address (agent mailbox never exposed), with the token `Reply-To` (`reply-<token>@<inbound-domain>`) and threading headers; the outbound `messageId` is stored. The timeline interleaves customer messages and internal comments chronologically with unmistakable per-item tags/colour (📧 to/from customer, 🔒 internal). Sending is gated by the existing `canAccessTicket` rule.

A derived `RESEND_RECEIVING_ENABLED` flag (mirroring the existing "Resend configured" pattern) gates outbound-only degrade: when receiving is disabled, hide the composer and omit the token `Reply-To`. The composer is also hidden when the form has `allowCustomerReplies` false.

## Acceptance criteria

- [ ] `TicketMessage`, `Intake.replyToken`, `IntakeFormConfig.allowCustomerReplies`, and `Attachment` message reference exist via migration
- [ ] Migration backfills `replyToken` for all existing `Intake` rows (idempotent)
- [ ] A permitted staffer can send a customer reply from an intake ticket; the customer receives an email from the agent's display name over the shared support address
- [ ] Outbound emails carry the token `Reply-To` and stored `messageId`; threading headers set
- [ ] The sent message persists as an outbound `TicketMessage` and renders in the interleaved timeline with a customer-facing tag
- [ ] Internal comments and customer messages are visually distinct in one chronological timeline
- [ ] Sending is rejected for a user failing `canAccessTicket`
- [ ] Composer is hidden (and token `Reply-To` omitted) when `RESEND_RECEIVING_ENABLED` is false or the form disallows customer replies
- [ ] Unit tests for token generation and the send-eligibility gate; route test for send persistence, headers, and permission rejection

## Blocked by

None — can start immediately.
