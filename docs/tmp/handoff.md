# Handoff — "Reply to Customer" feature

**Project:** PEN-Ticketing-System
**Date:** 2026-07-07
**Branch:** `temp`
**Context doc:** `docs/CONTEXT.md`

Two-way email conversation between support staff and intake submitters, threaded into tickets (Jira "Reply to customer" analogue). Builds on the now-shipped Intake Forms feature.

---

## State: 009 done, 010–017 not started

Full design, decisions, and rationale live in artifacts — **do not re-derive**:
- PRD: `docs/prd-customer-reply.md`
- Issues (tracer-bullet slices): `docs/issues/009`–`017-*.md`
- Design memory: `~/.claude/projects/-home-hasib-core-work-pen-PEN-Ticketing-System/memory/customer-reply-feature-design.md` + `pengroup-dns-topology.md`

Critical path: **009 → 011 → {012–017 parallel}**; 010 any time after 009.

---

## 009 — shipped & verified

Schema migrated to live Supabase (`prisma migrate status` clean, migration `20260707120000_add_customer_messages`, reply tokens backfilled). See `git diff` / new files for specifics; highlights:

- `TicketMessage` model, `Intake.replyToken`, `IntakeFormConfig.allowCustomerReplies`, `Attachment.messageId`
- `src/lib/customer-conversation.ts` (token gen + reply-address build/extract)
- `sendCustomerReplyEmail` in `src/lib/email.ts`; `INBOUND_DOMAIN`/`RECEIVING_ENABLED` in `src/lib/email-config.ts`
- `POST /api/tickets/[id]/messages`
- UI: `src/components/tickets/customer-reply.tsx` + interleaved timeline in `ticket-detail-page.tsx`
- Tests green (15): `customer-conversation.test.ts`, `messages/route.test.ts`

---

## Gotchas for next session

- **AGENTS.md rule:** read `node_modules/next/dist/docs/` before writing Next.js code. 011 uses `after()` (post-response work) + a public webhook — verify against Next 16.2.7 docs.
- **Pre-existing test noise (NOT 009 regressions):** ~24 route tests fail under vitest because `assertTicketAccess → getProfileDeptScope → cookies()` can't run in node env; several `.test.ts` files also have Profile-mock type errors. New tests avoid this by mocking `@/lib/auth`.
- **`RECEIVING_ENABLED` degrade:** composer hidden + token `Reply-To` omitted when `RESEND_INBOUND_DOMAIN` unset. To see the composer locally, set that env var.
- **009 interpretation:** receiving-disabled → composer fully hidden + endpoint 409 (stricter than PRD story 27's "outbound-only"). Keep consistent unless product says otherwise.
- Raw SQL migrations are hand-written (not `migrate dev`); apply with `prisma migrate deploy`.
- Ops (issue 017, HITL): `reply.pengroup.com` MX at Namecheap; investigate existing AWS SES inbound on `mail.pengroup.com`. `pengroup.com` root = M365 — do not touch.

---

## Next step

User preference: **010** (thread bootstrap — intake-confirmation email = message #1 with token `Reply-To`; fold `sendResolutionEmail` through the `TicketMessage` pipeline, no UX change). Then **011** (inbound trunk).

---

## Suggested skills

- `/review` or `/code-review` — review the 009 diff before extending.
- `/verify` or `/run` — exercise 009 in the running app (needs `RESEND_INBOUND_DOMAIN` set).
- `/tdd` — for 010/011; the pure-logic seams (matching, trust, stripping) are the high-value test targets.
