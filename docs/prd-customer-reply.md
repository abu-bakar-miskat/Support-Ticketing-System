# PRD — Reply to Customer: Two-Way Email on Intake Tickets

> Status: ready-for-agent
> Origin: grilling session 2026-07-07. Builds on issues 001–008 (intake → ticket auto-conversion).

## Problem Statement

Tickets created from an intake form carry the submitter's original request, but the conversation dies there. When support staff need more information, or want to tell the submitter their request is resolved, there is no channel inside the ticket to talk to that person. Today the only outward touchpoints are the automated intake-confirmation email and the resolution email — both one-shot, neither able to receive a reply. Staff fall back to their personal inboxes, so the back-and-forth with the customer lives outside the ticket, invisible to teammates and absent from the audit trail.

## Solution

A "Reply to customer" capability on any ticket that originated from an intake form. Staff compose replies from a dedicated composer on the ticket; the message is emailed to the submitter from the agent's name over a shared support address. When the customer replies to that email, the reply is captured, matched back to the originating ticket, and appears in the ticket's timeline interleaved with internal comments — each item unmistakably tagged as customer-facing or internal. The whole exchange stays attached to the ticket, visible to the team, and part of the activity record. The intake-confirmation email becomes the first message of the thread, so a customer can start the conversation before any staff action, and the existing resolution email becomes a normal (replyable) message in the same thread.

---

## User Stories

1. As a support staffer, I want a "Reply to customer" composer on an intake-originated ticket, so that I can email the submitter without leaving the ticket.
2. As a support staffer, I want the composer clearly separated from the internal comment box, so that I never accidentally send an internal note to the customer.
3. As a support staffer, I want the composer to show the customer's email address as the recipient, so that I always know who will receive the message.
4. As a support staffer, I want my reply to be sent from my own display name over a shared support address, so that the customer gets a personal reply while my personal mailbox stays private.
5. As a customer, I want to reply to any email from the support team, so that I can continue the conversation naturally from my own inbox.
6. As a customer, I want my reply to reach the right ticket automatically, so that I don't need to quote reference numbers or use a portal.
7. As a support staffer, I want the customer's replies to appear in the ticket timeline, so that the whole conversation is in one place.
8. As a support staffer, I want customer messages and internal comments in one chronological timeline with clear tags and colour, so that I can follow what happened when without confusing audiences.
9. As a customer, I want to receive a confirmation email when I submit an intake form, so that I know it was received — and I want to be able to reply to it to add detail.
10. As a support staffer, I want the intake-confirmation email to seed the conversation, so that a customer's first reply already has a ticket to land on.
11. As a support staffer, I want to be notified when a customer replies, so that I can respond promptly.
12. As a department manager, I want a fallback notification when a customer replies to an unassigned ticket, so that no customer message is silently lost.
13. As a support staffer, I want a message from an unexpected sender address to be quarantined and flagged, so that I am not tricked into treating a stranger as the customer.
14. As an assignee or department manager, I want to accept a quarantined message once I confirm it is genuinely from the customer, so that legitimate replies from alternate addresses still get through.
15. As a support staffer, I want auto-reply and out-of-office messages kept out of the main conversation, so that the timeline is not polluted by machine noise.
16. As a support staffer, I want quoted history and signatures collapsed by default with an option to expand, so that I read the customer's new words without scrolling through the whole thread.
17. As a support staffer, I want to attach files to a customer reply, so that I can send screenshots, documents, or instructions.
18. As a customer, I want to attach files to my reply, so that I can share screenshots or supporting documents.
19. As a support staffer, I want inbound attachments stored against the message and downloadable, so that I can review what the customer sent.
20. As a support staffer, I want potentially dangerous attachment types flagged and not opened inline, so that the system does not expose staff to executable files.
21. As a support staffer, I want the resolution email to be part of the same conversation thread, so that a customer can reply to "resolved" and reopen the discussion.
22. As a customer, I want to reply to a resolved ticket, so that I can say it is not actually fixed.
23. As a support staffer, I want a customer's reply to a closed ticket to reopen it and notify me, so that reopened issues re-enter the workflow instead of being missed.
24. As a support staffer, I want to see who accepted a quarantined message, so that there is accountability for admitting an unverified sender.
25. As a workspace admin, I want to disable customer replies on specific intake forms, so that forms that should not open a two-way channel (e.g. an anonymous suggestion box) do not.
26. As a support staffer, I want customer replies rendered safely, so that a malicious email cannot run scripts against me when I open the ticket.
27. As a support staffer, I want the reply capability to degrade gracefully in environments without an inbound mail domain, so that staging and local development still let me send (outbound-only) without handing customers a dead reply address.
28. As a support staffer, I want the same access rules as internal comments to govern who can reply to the customer, so that the permission model stays simple and department-scoped.
29. As a support staffer, I want high-volume inbound bursts to stop spamming my notifications while still being stored, so that an auto-responder loop does not bury me.
30. As a compliance owner, I want raw inbound email payloads purged after a retention window while the displayed message is kept, so that we minimise stored personal data.
31. As a support staffer, I want each outbound message threaded correctly in the customer's mail client, so that the customer sees one coherent conversation rather than disconnected emails.

---

## Implementation Decisions

### Domain model (Prisma schema)
- **New `TicketMessage`** entity, deliberately separate from `Comment` so that customer-facing messages and internal notes are physically distinct — separation is the leak-prevention property, not a runtime flag. Fields: ticket reference, `direction` (inbound/outbound), nullable author profile (null denotes the customer), sender name/email, sanitized display body, raw payload (for audit), provider `messageId`, `inReplyTo`, a trust `status` (trusted/quarantined), quarantine-acceptor reference, and timestamps.
- **`Intake`** gains a `replyToken` — an opaque, unguessable secret that anchors the conversation. The token is the customer identity anchor; `submitterEmail` already lives on `Intake`.
- **`IntakeFormConfig`** gains `allowCustomerReplies` (default true). When false, no token `Reply-To` is issued and the composer is hidden.
- **`Attachment`** gains a nullable message reference so files can hang off a `TicketMessage` (mirrors the existing nullable ticket/comment references).

### Inbound matching
- Primary match: the token is the **entire local part** of the reply address (`reply-<token>@<inbound-domain>`), not plus-addressing — plus-tags get normalised away by some relays, whereas Resend catches every local part on the receiving domain.
- Fallback match: `In-Reply-To` / `References` headers against stored outbound `messageId`s, for customers who compose fresh mail instead of replying.
- Human-readable subject tag (`Re: [HUMAN-ID] subject`) is cosmetic only; it is never the authoritative match.

### Inbound pipeline
- Dedicated public webhook endpoint receives Resend `email.received` events. Resend webhooks are **metadata-only**; the handler verifies the svix signature, performs an idempotency insert keyed on the event id and `Message-ID`, returns `200` immediately, then does the heavy work in a post-response task: fetch full email + attachments via Resend's retrieval APIs, persist the `TicketMessage`, store attachments to Supabase Storage.
- **Trust decision:** token valid AND `From` equals the intake's `submitterEmail` → trusted; token valid but sender mismatched → **quarantined** (stored, flagged, not rendered as the customer's words until an assignee or department manager accepts); invalid/absent token → dropped and logged.
- **Auto-reply detection** via `Auto-Submitted: auto-replied`, `X-Autoreply`, and `Precedence: bulk` → marked as system, kept out of the main feed.
- **Rate-limit** per thread (soft cap ~20 inbound/hour): still stored, but notifications suppressed past the cap and the burst flagged.

### Content handling
- Prefer the `text/plain` part; fall back to HTML only when plain text is absent, then strictly sanitize (remove scripts, styles, event handlers) and **strip remote images**. Rendering inbound HTML must not reuse the raw-HTML rich-text render path used for intake responses.
- Quote/signature stripping uses a hand-rolled heuristic on plain text (markers such as `On … wrote:`, `-----Original Message-----`, leading `>` blocks, `-- `/`__` signature delimiters). The stripped portion is preserved in the raw payload behind a "show quoted text" expander.

### Outbound
- Sent from the agent's display name over a shared support address (agent's real mailbox never exposed). Token `Reply-To` set (only when the form allows replies). Threading headers (`In-Reply-To`/`References`) set to the customer's last message; the provider `messageId` of every send is stored for fallback matching.
- The **intake-confirmation email is message #1** — token generated during intake→ticket conversion so the thread exists from the start.
- The **resolution email is folded into the `TicketMessage` pipeline**: the existing status→complete trigger and resolution-note capture are unchanged, but the send now flows through the same outbound path so the resolution is a normal, replyable message. No change to the resolution UX.

### Lifecycle
- A customer reply to a ticket in a completion status **auto-reopens** it to the team's first non-completion `TeamStatus` (by order), appends the message, and notifies. Reopen is signalled as part of the customer-reply notification, not a second one.

### Permissions
- Sending a customer reply is gated by the existing `canAccessTicket` rule (same department-scoped gate as internal comments — no new permission concept).
- Accepting a quarantined message is restricted to the ticket's assignee or a department manager; the acceptor is recorded.

### Notifications
- New `customer_reply` notification to the assignee, falling back to the department manager / ticket creator when unassigned. In-app always; email respects existing per-user email preferences.
- Distinct `customer_reply_review` notification (assignee + manager) for quarantined messages, worded as "needs review".

### Configuration & environments
- New settings/env: inbound receiving domain and inbound webhook signing secret, plus a derived "receiving enabled" flag mirroring the existing "Resend configured" pattern.
- **Receiving domain:** a fresh subdomain (`reply.pengroup.com`) with no existing MX, chosen to avoid colliding with the Microsoft 365 root MX and the AWS SES inbound MX already present on `mail.pengroup.com`.
- When receiving is disabled (local/preview), the feature **degrades to outbound-only**: composer hidden, no token `Reply-To` issued.

### Data retention
- Displayed message body kept permanently; raw inbound payload purged on a **90-day TTL** to minimise stored personal data.

### Migration
- Backfill `replyToken` for **all existing `Intake` rows** (one cheap token each; idempotent) so live tickets can converse immediately, not new-tickets-only.

---

## Testing Decisions

Good tests here assert externally observable behavior — given an inbound payload, what message/ticket state results; given a compose request, what gets persisted and which headers are set — not internal function shapes. Prior art: pure-logic unit tests (`src/lib/mentions.test.ts`, `src/lib/project-permissions.test.ts`) and API route-handler tests (`src/app/api/tickets/[id]/status/route.test.ts`, `src/app/api/tickets/route.test.ts`, `src/app/api/comments/[id]/route.test.ts`).

Seams, highest first:

- **Pure lib units** (preferred seam — no HTTP, no DB): token generation and extraction from a recipient address; the inbound trust decision (verified vs quarantine vs drop); header-fallback matching against stored message ids; quote/signature stripping over representative plain-text bodies; HTML sanitization (scripts/handlers/remote images removed); auto-reply detection over header sets; auto-reopen target resolution given an ordered `TeamStatus` list. These are the intake-conversion-style functions and should carry the bulk of coverage.
- **Inbound webhook route test** (`POST` inbound endpoint): rejects an unsigned/invalid-svix request; a redelivered event does not double-post (idempotency); a valid token routes to the correct ticket and creates a trusted message; a sender mismatch produces a quarantined message; an auto-reply is kept out of the main feed.
- **Outbound reply route test**: a permitted user's reply persists a `TicketMessage`, sets the token `Reply-To`, and stores the outbound message id; a user failing `canAccessTicket` is rejected; a form with `allowCustomerReplies` false omits the token `Reply-To`.
- **Lifecycle**: replying to a completed ticket reopens it to the correct status and emits a single customer-reply notification.

Test the trust/matching/stripping units exhaustively (they encode the security-sensitive decisions); test routes at the behavior level (status codes, persisted records, headers), stubbing Resend send/fetch and Supabase Storage.

## Out of Scope

- Customer replies on tickets **not** originating from an intake form (feature is intake-scoped for v1).
- A customer-facing web portal or login — the entire customer experience is email.
- Multi-participant threads (CC'd colleagues becoming first-class participants); mismatched senders are quarantined, not added as participants.
- Remote-image proxying (images are stripped, not proxied).
- A dedicated durable queue for inbound processing (post-response task is sufficient at current scale; escalate to a queue later if volume/reliability demands).
- Rich-text/HTML-first inbound rendering (plain-text-preferred for v1).
- Migrating the resolution composer UI — only the send path is folded into the message pipeline.
- Provisioning DNS/MX and Resend receiving configuration (ops prerequisites, tracked separately).

## Further Notes

- **Ops prerequisites (not code):** add a lowest-priority MX for `reply.pengroup.com` in Namecheap; enable Resend receiving + the `email.received` webhook; set the inbound domain and webhook-secret env vars. **Also investigate the existing AWS SES inbound rule set on `mail.pengroup.com` (eu-west-1)** to confirm what it serves before relying on the mail infrastructure.
- The token is a bearer secret carried in the `Reply-To` of every outbound email; quarantine-on-sender-mismatch is the mitigation for a leaked/forwarded token, deliberately chosen over token-only trust (accepts impersonation) and hard-reject (loses legitimate alias/CC replies).
- Because Resend inbound webhooks deliver metadata only, an extra retrieval round-trip is inherent; the post-response processing model is a direct consequence, not an optimisation.
- Related design record: memory notes `customer-reply-feature-design` and `pengroup-dns-topology`.
