# SLA implementation plan — five sequential stages

Created: 2026-10-09

## Resume context

- Requirements: [sla-requirements.md](sla-requirements.md). Treat this as the source of intended behavior.
- Existing implementation description: [sla.md](sla.md), written from code on 2026-10-08. Verify its claims against current code before implementation.
- Repository instructions: [AGENTS.md](../AGENTS.md).
- The initial review compared the two documents only; it did not audit the code.
- No implementation has started as part of this plan. The user requested this file so work can continue in a new session.

## Required working process

Work through the stages below in order, one at a time.

1. When the user asks to begin or continue, determine the current stage from the progress table and handoff notes.
2. Inspect current code, implement the current stage, and complete appropriate verification.
3. Include shared timer changes needed to make that stage fully functional; do not postpone essential behavior to Stage 4.
4. Update this file with changes, verification results, limitations, and concrete user testing steps.
5. Mark the stage **Awaiting user testing** and stop implementation work.
6. Wait for the user to test it and explicitly approve proceeding, for example: **“Good to go with the next stage.”**
7. If the user reports a problem, fix it within the current stage and return it for testing. Do not proceed to the next stage.

Saving this plan does not authorize starting implementation. Do not infer approval from elapsed time or from a stage's automated checks passing.

## Progress

| Stage | Scope | Status | User approval to proceed |
|---|---|---|---|
| 1 | Manual tickets | Not started | Pending |
| 2 | Shared mailbox tickets | Not started | Pending |
| 3 | Support form and Portal tickets | Not started | Pending |
| 4 | Working hours, waiting states, and lifecycle | Not started | Pending |
| 5 | Reporting and cleanup | Not started | Pending |

## Stage 1 — Manual tickets

### Deliverables

- Use the ticket's Estimated Time as its allowed resolution time.
- Compare actual tracked work time against that estimate. Do not substitute wall-clock time since ticket creation for tracked work.
- Record a resolution breach and notify the manager once when tracked time exceeds the estimate before resolution.
- Continue tracking after breach until the ticket is resolved.
- Show estimated time, actual tracked time, and overtime.
- Do not introduce a first-response SLA for manual tickets; the requirements call for estimated-time resolution tracking.
- Inspect the existing time-tracking flow and reuse it where appropriate.

### Acceptance and user testing

- Create a manual ticket with a short estimate.
- Track work below the estimate: no breach should occur.
- Track work beyond the estimate: the breach should be recorded and the intended manager notification generated once.
- Continue tracking: overtime should increase.
- Resolve the ticket: final totals should remain available and tracking should stop according to the workflow.
- Verify self-assigned tickets and tickets assigned to another user.

Use controlled notification verification so real managers are not emailed accidentally.

## Stage 2 — Shared mailbox tickets

### Deliverables

- Configure first-response and resolution targets for each shared mailbox.
- Automatically apply the corresponding SLA to inbound tickets, without requiring an issue.
- Apply department SLA where applicable and tenant SLA otherwise, consistent with the requirements. Inspect how mailbox-specific configuration fits this hierarchy before choosing the data model.
- Count only configured working days and hours.
- Stop first response on a customer-facing agent reply or entry into the configured active status.
- Pause resolution while waiting for the customer and resume when the customer replies.
- Support configurable early warnings, breach records, manager notifications, first-response escalation, and continued overtime tracking.

### Acceptance and user testing

- Receive a new shared-mailbox ticket and confirm both targets apply automatically.
- Verify the same mailbox rules apply without an issue selection.
- Verify applicable department configuration and tenant fallback.
- Reply or enter the active status and confirm first response stops.
- Enter Waiting for Customer and confirm resolution pauses.
- Receive a customer reply and confirm Waiting for Assignee and resumed resolution.
- Resolve the ticket and confirm final totals.
- Verify warning and breach behavior through controlled checks.

## Stage 3 — Support form and Portal tickets

### Deliverables

- Preserve issue-specific first-response and resolution targets.
- Make applicable department-to-tenant fallback consistent, without unintentionally overriding explicit issue targets.
- Ensure support-form and Portal API submissions use the same SLA behavior.
- Stop first response on a public reply or entry into the configured active status.
- Ensure working-hours, customer-wait pauses, warnings, breaches, escalation, and overtime work for both sources.
- Inspect behavior for submissions without an issue. The requirements describe issue-selected submissions; do not invent a new no-issue policy without resolving the intended behavior.

### Acceptance and user testing

- Submit the same issue through the support form and Portal API and compare targets and behavior.
- Submit different issues and confirm their individual targets apply.
- Verify department and tenant fallback in applicable cases.
- Enter the configured active status without replying and confirm first response stops.
- Verify public replies/comments, customer waiting, customer replies, and resolution.

## Stage 4 — Working hours, waiting states, and lifecycle

### Deliverables

- Verify consistent calendar behavior across all applicable ticket types, while preserving manual tickets' actual-work tracking semantics.
- Ensure SLA clocks exclude time outside configured working days and hours. The UK 08:30–17:00 schedule in the requirements is an example, not a hardcoded requirement.
- Cover tickets created outside working hours and clocks crossing a working-period boundary.
- Make Waiting for Customer pause resolution and customer replies change the status to Waiting for Assignee and resume resolution.
- Cover customer-facing email, message, and comment paths; do not treat every outbound message as proof of a waiting status.
- Prevent reassignment or calendar changes from rewriting previously counted elapsed time.
- Confirm completion stops the appropriate timers.
- Define and confirm reopen behavior before changing it: the requirements do not specify whether first response gets a fresh cycle or how repeat resolution alerts work.

### Acceptance and user testing

- Create a ticket outside working hours and verify counting begins at the next working period.
- Cross the end of a working period and verify pause/resume behavior.
- Verify configured timezone and daylight-saving boundaries where applicable.
- Repeat customer-wait and customer-reply cycles and verify no waiting time counts against resolution.
- Reassign a ticket between users with different schedules and verify historical elapsed time remains stable.
- Resolve and reopen a ticket and verify the agreed lifecycle rules.

## Stage 5 — Reporting and cleanup

### Deliverables

- Use an authoritative calculation for SLA compliance and final reporting. Keep manual estimated-time compliance based on actual tracked work.
- Resolve the current disagreement between SLA elapsed time and wall-clock resolution reporting.
- Show allowed time, actual first-response time where applicable, active resolution time, customer-wait time, and overtime.
- Ensure breach history and completed-ticket results remain reliable.
- Review warning/breach detection timing and duplicate prevention. The documented sweep runs every 15 minutes; verify the actual schedule and whether it meets the required warning behavior.
- Remove confirmed unused code only after checking references and other workflows. Candidates include `SlaRule` and retired policy-assignment fields.
- Review condition-based policy selection and sub-department precedence against other product needs before simplifying them. Being absent from this brief alone is not sufficient reason to delete them.
- Update [sla.md](sla.md) to describe the final implementation and remove questions already answered by the requirements.

### Acceptance and user testing

- Review completed tickets from all four sources.
- Verify displayed allowed time, active/tracked time, waiting time, overtime, and compliance agree with their timer behavior.
- Verify warning/breach history and notification deduplication.
- Check that existing assignment, automation, and reporting workflows still work after cleanup.

## Implementation constraints

- Read relevant guides in `node_modules/next/dist/docs/` before writing Next.js code, as required by `AGENTS.md`.
- The configured Supabase database is shared and live. Do not perform destructive experiments or modify real team tickets for testing.
- Never run `prisma migrate dev` or `prisma migrate reset`.
- Every `prisma/schema.prisma` edit must ship a migration and be applied to the shared database before merge. Follow the exact diff, review, execute, resolve, and generate workflow in `AGENTS.md`.
- Generated migration SQL may contain unrelated drift. Remove unrelated statements and avoid destructive changes.
- Do not trigger real completion notifications during testing. Verify SLA manager alerts in a controlled way as well.
- Inspect local cron behavior before running development code that changes sweeps or notifications: the implementation document warns that local cron can operate against the shared database.

## Decisions still requiring clarification when relevant

- Which configured active statuses qualify as first response?
- Whether sub-department managers should receive alerts in addition to department managers.
- Calendar ownership and behavior when tickets move departments.
- Reopen cycles and repeat breach notifications.
- Whether priority changes should affect existing targets; this is not requested by the requirements.

Manual estimated-time breaches, mailbox SLA, and working-hours pausing are already required. Do not reopen these as optional product questions.

## Handoff notes

- Current stage: Stage 1, not started.
- Completed work: document comparison and this implementation plan only.
- Implementation changes: none.
- Verification: no application tests run; this is a planning document.
- Next action: when the user requests implementation, inspect the manual-ticket creation, time tracking, breach notification, and reporting code, then complete Stage 1 only.
- After completing Stage 1: update this file, provide testing steps, and wait for explicit approval before Stage 2.

Suggested new-session prompt:

> Read AGENTS.md, docs/sla-requirements.md, docs/sla.md, and docs/sla-implementation-plan.md. Start Stage 1 only. Update the plan with your results, then wait for me to test and approve before starting the next stage.
