# 14 — MailboxConnection intake + threading + suppression

**Type:** HITL · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Add `MailboxConnection(scope = DEPARTMENT | SUB_DEPARTMENT, address, auth_type, credentials_ref, status)`. Reuse the existing inbound-processing + `TicketMessage` feed + outbound path behind a **provider abstraction**; the current provider works now, OAuth (M365/Google) + IMAP land behind it later (EM-05). Inbound mail to a connected address creates a ticket on the right board/sub-department (EM-01/02/03); dedupe on Message-ID (MAIL-01). Thread customer replies onto the originating ticket via In-Reply-To/References with the ticket reference as fallback — no duplicate ticket (EM-04). Suppress auto-generated mail (bounces, OOO, Auto-Submitted) and log it (EM-06). Surface connection failures within one polling cycle with exponential-backoff retry (EM-07). Credentials encrypted at rest, never returned by any API (NFR-03).

HITL: provider-abstraction design + credential handling.

## Acceptance criteria
- [ ] A department/sub-department mailbox connection creates tickets on the correct board/sub-department; Message-ID dedupe prevents duplicates.
- [ ] Customer replies thread onto the originating ticket (headers, reference fallback) with no duplicate ticket.
- [ ] Auto-generated mail is suppressed and logged.
- [ ] Connection failures surface to the Department Admin within one polling cycle and retry with backoff.
- [ ] Credentials are encrypted at rest and never returned by any API.

## Blocked by
- 04 — Department board + status-typed columns
- 05 — Team→SubDepartment scope tag + SD-06 enforcement
