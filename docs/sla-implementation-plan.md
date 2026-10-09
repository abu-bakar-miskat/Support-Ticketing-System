# SLA implementation plan — five sequential stages

Created: 2026-10-09

## Resume context

- Requirements: [sla-requirements.md](sla-requirements.md). Treat this as the source of intended behavior.
- Existing implementation description: [sla.md](sla.md), written from code on 2026-10-08. Verify its claims against current code before implementation.
- Repository instructions: [AGENTS.md](../AGENTS.md).
- The initial review compared the two documents only; it did not audit the code.
- Stage 1 is approved. Stage 2 is implemented and awaiting user testing; later stages remain unstarted.

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
| 1 | Manual tickets | Approved | User approved Stage 2 on 2026-10-09 |
| 2 | Shared mailbox tickets | Awaiting user testing | Pending |
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
- Automatically apply the corresponding SLA to inbound tickets, without requiring an issue. First response starts at email receipt; resolution stays pending until agent work begins (active-status entry or work-timer start), per the user correction on 2026-10-09.
- Shared-mailbox SLA is department-only, per the user correction on 2026-10-09. Mailbox overrides inherit department mailbox targets; tenant policies do not apply.
- Count only configured working days and hours.
- Stop first response on a customer-facing agent reply or entry into the configured active status.
- Pause resolution while waiting for the customer and resume when the customer replies.
- Support configurable early warnings, breach records, manager notifications, first-response escalation, and continued overtime tracking.

### Acceptance and user testing

- Receive a new shared-mailbox ticket and confirm both targets apply automatically, first response runs, and resolution remains at zero/Not started until agent work begins.
- Verify the same mailbox rules apply without an issue selection.
- Verify mailbox overrides and department defaults. With neither configured, verify no mailbox SLA applies.
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

## Stage 1 implementation results — 2026-10-09

Status: **Awaiting user testing**. Stages 2–5 have not been started.

### Changes

- Reused `TimeEntry` work sessions and the existing Time Tracking display, which already shows estimated time, live tracked time across users, and overtime. Added a resolution-only SLA overview for privileged viewers after user testing revealed that the existing two-clock SLA API omitted manual tickets.
- Manual tickets compare their `estimatedTime` against summed actual work, including running sessions. Exactly reaching the estimate is compliant; exceeding it records a resolution breach.
- Recorded manual breaches in `SlaBreach` with metric `resolution` and opaque `timerId` `manual:<ticketId>`. No two-clock `SlaTimer` or first-response SLA is introduced. No schema changes or migrations were needed.
- The existing `estimateOverrunNotifiedAt` guard and breach insertion now commit in one transaction, preventing concurrent checks from recording/sending duplicate breaches. Notifications use the existing `time_estimate_exceeded` in-app/push channel for the assignee, department managers, and active tenant managers, with duplicate recipients removed.
- Extended the existing authenticated SLA sweep to check open, estimated manual tickets with tracked work, including running sessions. Timer stops, automatic switches, workflow stops, and estimate edits also check for overruns.
- Added manual completion finalization to shared lifecycle hooks: stop open work sessions at `closedAt`, broadcast timer stops, and store tracked resolution duration/compliance. Compliance uses seconds, so 61 seconds against a one-minute estimate correctly fails even though the stored whole-minute duration rounds to one.
- Prevented starting work on resolved tickets and protected late stops from counting beyond completion or overwriting an already stopped session.
- Manual eligibility excludes Intake-backed support/portal tickets and email-origin mailbox tickets, including mailbox timers. Preserved existing non-manual estimate notifications in `legacy-time-estimate-notify.ts`.

### Verification

- Read repository instructions, both SLA documents, and the installed Next.js route-handler guide before editing.
- Inspected local runtime: an existing `next dev` process was running; the local crontab was empty. Did not start a server, invoke cron routes, create/update live tickets, or send notifications.
- Focused verification: **71 tests passed across 7 files**, including mocked notification recipients, strict estimate boundaries, running/stopped sessions, deduplication, overtime after breach, finalization, sweep inclusion, and resolved-ticket timer API behavior.
- ESLint passed for changed application/test files; `git diff --check` passed.
- Full suite at implementation verification: **1432 passed, 51 failed, 2 skipped**. Compared against an isolated unchanged HEAD worktree: **1415 passed, the same 51 failed, 2 skipped**. No new failing test cases. Two additional timer API tests subsequently passed in the focused run above.
- Typecheck reports the same pre-existing error on unchanged HEAD and this implementation: `src/app/departments/page.tsx:303` omits required `DepartmentMailboxUsage.basePath`. No Stage 1 type errors at that check.
- All new checks mock database writes and notification delivery. No shared DB changes or real manager notifications were used for verification.

### Limitations and decisions retained for later stages

- A continuously running session is checked by the existing 15-minute cron cadence, so its persisted breach/notification can lag the visible overtime. Stopping work or editing the estimate also triggers an immediate check. Do not invoke the shared sweep just to speed up a test: it processes other live tickets too.
- Delivery remains the existing best-effort notification mechanism; transactional breach/guard persistence prevents duplicates but does not add a durable delivery retry queue.
- Broad resolution reporting remains Stage 5. Manual completion totals now use tracked work; historical completed tickets are not backfilled.
- Existing workflow stops (leaving In Progress and customer-wait transitions) are retained. Breach itself never stops tracking. Reopen cycles and resetting work after a historical breach do not clear its notification guard; further lifecycle decisions remain Stage 4.

### Concrete user testing steps

Use an isolated test tenant/department with controlled assignee and manager accounts. Ensure **all** assignment/completion email recipients are test inboxes and outbound delivery is safely captured before creating or resolving test tickets. Do not use real team tickets or managers.

1. Create a manual ticket assigned to yourself with a **1-minute** Estimated Time. Enter In Progress or start the work timer. Confirm the existing Time Tracking panel shows tracked time and estimate, with no first-response SLA.
2. Stop after roughly **30 seconds**. Confirm no resolution breach or manager overrun notification.
3. Restart and exceed **60 seconds total** across the sessions, then stop. Confirm one manager notification saying the ticket breached its resolution estimate and one `SlaBreach` row for `resolution`, target `1`, timer ID `manual:<ticketId>`. Use read-only DB inspection if necessary.
4. Restart again. Confirm tracked time and overtime continue increasing. Stop/restart repeatedly; confirm no duplicate breach row or notification.
5. Resolve while a work timer is running. Confirm it stops, final tracked/estimated/overtime values remain available on refresh, and restarting work returns the resolved-ticket error. Read-only inspection of `resolutionDurationMins` and `resolvedWithinAllowed` should show tracked minutes and `false` for this overrun.
6. Repeat with a ticket created by one account and assigned to another; have the assignee track work. Confirm totals and the intended department manager notification behave the same way. If using co-assignees, their sessions should contribute to the same ticket total.
7. For continuous-running detection, leave an isolated test session over estimate through the next normally scheduled sweep; confirm one notification without stopping the session and that overtime continues. Automated mock tests already verify this path without invoking the shared cron.

After testing, report any Stage 1 issue for correction. Explicit approval such as **“Good to go with the next stage”** is required before Stage 2 begins.

## Stage 1 user-test fixes — 2026-10-09

Reported ticket: `cmv11m0430000mijxdylf220k` (“Test new Manual ticket.”).

- Read-only inspection confirmed **5m estimated, 8m 16s tracked, 3m 16s overtime**, a persisted resolution breach, and an unread `time_estimate_exceeded` notification for the assigned department manager. The tenant manager accounts were excluded by the original department-only recipient lookup.
- Included active **tenant-scoped managers** in new manual resolution alerts, while retaining department-manager/assignee recipients and deduplicating overlapping roles. No alert was resent or backfilled for the reported ticket; its original department-manager alert remains in place. Newly included tenant managers should verify notification delivery with a fresh controlled test ticket.
- Added explicit breach wording and the alert icon for `time_estimate_exceeded` in the notification sidebar; these rows previously fell back to a generic status-change label.
- Added a read-only `manualResolution` payload to the ticket SLA API. Super admins, tenant admins/managers for that ticket's tenant, and authorized department admins/managers receive the full resolution overview. Existing ticket-access gates remain required; a manager role in another tenant does not confer overview access.
- The manual overview shows estimate, tracked work, overtime, breach status/history, and completion. It never shows a first-response metric. Work durations retain seconds, and exactly reaching the estimate remains compliant.
- Updated the shared SLA fetch to refresh when manual estimate/work-session state changes and poll running manual sessions. Multiple simultaneous work sessions contribute at their respective rate; closed totals stay frozen.
- Verification: **81 focused tests passed across 9 files**, including API access checks, tenant-manager recipient deduplication, and server-rendered overview output. The real read-only Prisma reader returned the expected totals and breach history for the reported ticket.
- Typecheck still has only the previously confirmed `DepartmentMailboxUsage.basePath` error. Lint for the two existing large UI files reports the same **47 errors / 14 warnings** as unchanged HEAD; no new diagnostic signatures, and the remaining changed files are clean. `git diff --check` passed.
- Browser verification was unavailable because no browser connection was exposed. Database access was read-only; no live tickets or notification records were altered and no real notifications/emails were sent.

Retest by refreshing the reported ticket as the super admin and an authorized tenant manager: the sidebar should show **SLA overview → Resolution → Breached**, **8m 16s** tracked, **5m** target, and **3m 16s** over. Open the department manager's notification panel in the Support department to see the existing alert with its corrected breach label. Use a fresh controlled manual ticket to verify the additional tenant-manager recipients.

Stage 1 remains **Awaiting user testing**. No later stage is authorized.

## Stage 1 creation-estimate display fix — 2026-10-09

- User testing found Personal Estimates empty despite an estimate supplied at creation. Creation saved `Ticket.estimatedTime` but omitted the primary assignee's `TicketEstimate` row.
- New manual creations save that personal row together with the ticket. A single creation estimate belongs to the primary assignee, whether self-assigned or assigned to another user; co-assignees retain their separate estimates.
- For existing tickets without any personal rows, the detail payload displays the saved creation estimate for the primary assignee. Explicit personal rows take precedence. No date is inferred.
- The first personal-estimate edit on such an older ticket persists the creation estimate before recalculating the rollup, so adding a co-assignee's estimate does not erase the original. Clearing the primary estimate still removes it and does not resurrect it through the display fallback.
- Read-only verification of `cmv11m0430000mijxdylf220k` confirmed zero saved personal rows and an updated displayed personal value of **5 minutes** for its assignee. No shared database rows were changed during verification.
- **110 focused tests passed across 11 files**; lint passed for these changed files, and `git diff --check` passed. Typecheck retains only the previously confirmed departments-page `basePath` error.
- Retest: fully refresh the reported ticket. Personal Estimates should show **Agent · Assignee · 5m**; selecting Edit should prefill **5m** rather than an empty time field. New self-assigned and other-assigned tickets should show their creation estimate without needing a second entry. For a co-assignee test, an original 5m plus a new 2m should roll up to 7m.

Stage 1 remains **Awaiting user testing**; later stages are untouched.

## Stage 2 results — 2026-10-09

User approved Stage 1 and authorized Stage 2 with “nice now start the Stage 2”.

### Implemented behavior

- Shared-mailbox settings support targets for each connected mailbox. Updated precedence after user correction: explicit mailbox targets → department mailbox defaults only. Tenant policies do not apply. No issue selection is required. Clearing an override inherits the department; with no department/mailbox targets configured, no SLA timer is created.
- New inbound ticket creation stores its SLA timer atomically with the ticket and origin. First response starts at actual ticket creation; resolution remains pending until agent work begins. A timer-write failure fails ticket creation instead of silently leaving a ticket without its configured SLA.
- New mailbox timers snapshot the applicable working calendar, holidays, warning percentage, configured active statuses, and target source. Working days/hours always apply to mailbox clocks, including outside-hours creation and weekend boundaries. Reassignment does not change an existing snapshot.
- Department settings expose configurable active statuses, defaulting to In Progress. First response stops on a public agent reply or the earliest configured active-status entry. Status-history reconciliation covers updates made through other entry points. Late responses retain a breach record without escalating an already answered ticket.
- Resolution pauses on trusted public outbound replies or explicit Waiting for Customer transitions, then resumes on a trusted customer reply. Internal/system/quarantined messages do not drive the mailbox SLA wait timeline. The existing derived conversation badge displays **Waiting for assignee** after customer replies; this is a derived sub-status, not an invented workflow status.
- Configurable warnings and breaches notify the assignee, department managers, and active tenant managers, with recipient deduplication. Transactional threshold claims prevent competing sweeps from recording duplicate breaches/alerts or escalating twice. Unanswered first-response breaches use existing escalation behavior. Breach does not stop overtime tracking.
- Resolution breaches strictly after exceeding its target. Closing captures final working-time totals and compliance and freezes the clocks. Outside-hours mailbox indicators continue polling so the UI resumes at the next working opening.
- General SLA-setting saves preserve mailbox active-status settings. Calendar input validation rejects invalid timezones, working days, and opening/closing times.

### Database and verification

- Applied additive migration `20261009160000_mailbox_sla_stage2`: nullable mailbox target columns and the timer's JSON calendar/configuration snapshot. Reviewed the live diff and removed unrelated IntakeFormConfig foreign-key drift, applied SQL, recorded migration, and regenerated Prisma Client. No existing tickets were backfilled or modified.
- **161 focused tests passed across 16 files**, covering target hierarchy, atomic creation failure, working-hour boundaries, snapshot stability, trusted conversation pauses, configured active statuses, warnings/manager recipients, concurrent breach deduplication, late responses, overtime, completion persistence, and Stage 1 regressions.
- Full-suite check: **1468 passed / 51 failed / 2 skipped**. The failing-case set matches the previously established unchanged-HEAD baseline; no new failing cases. Two subsequent focused test additions also pass.
- Typecheck retains only the pre-existing `src/app/departments/page.tsx:303` missing `DepartmentMailboxUsage.basePath` error. Changed Stage 2 files pass lint; `git diff --check` passes.
- Tests mock database writes and notification delivery. No live tickets were used to trigger warnings, escalation, completion, or real manager emails. Browser verification was unavailable; actual UI/email behavior remains for controlled user testing.

### Limitations retained

- New mailbox timers snapshot configuration at creation. Open email tickets from older webhook instances recover missing mailbox configuration when their SLA is accessed (see user-test fix below). Closed historical tickets are not backfilled; existing marked mailbox timers without a snapshot retain current-calendar fallback.
- Scheduled detection uses the existing 15-minute sweep. Short targets can pass a warning threshold before the next sweep; replies/status updates/completion also trigger checks. Delivery remains best-effort without a durable retry queue.
- Reopen-cycle redesign, broader lifecycle auditing, and reporting remain later stages. Existing reopen behavior is retained.

### Concrete user testing steps

Use an isolated test department/mailbox with controlled assignee and manager inboxes. Capture outbound delivery before testing completion or escalation. Do not invoke the shared SLA sweep manually: it processes other live tickets too.

1. Open department SLA settings. Set valid working days/hours/timezone and warning percentage. In Shared mailbox SLA, save department defaults and configure smaller first-response/resolution targets on one mailbox. Configure an additional active status if desired.
2. Send a new email to that mailbox. Confirm both targets apply without selecting an issue. Send to another mailbox without an override and confirm department targets. Clear department defaults and mailbox overrides in the isolated department and confirm no SLA timer appears on a new email ticket, even if tenant form policies exist.
3. Create outside working hours or near the end of a working period. Confirm clocks pause outside hours and resume at opening, excluding weekends/holidays. Change assignee after creation and confirm the existing ticket keeps its original calendar.
4. On separate new tickets, send a public agent reply or enter the configured active status. Confirm first response stops. A late reply should retain a first-response breach without escalating that answered ticket.
5. Confirm an agent reply shows Waiting for customer and pauses resolution. Also test an explicit Waiting for Customer transition. Send a trusted customer reply and confirm the derived Waiting for assignee badge and resumed resolution. Internal notes should not affect the clocks.
6. In controlled checks, reach the warning percentage and then exceed each target. Confirm manager notifications, one breach per metric, first-response escalation only while unanswered, and increasing overtime. Repeated refreshes/status checks should not duplicate alerts. Allow the normally scheduled sweep for unattended detection.
7. Resolve a ticket during working hours and refresh. Confirm final elapsed time, overtime/compliance, and stopped clocks remain stable. Compare totals with time spent inside working periods excluding customer waits.

Stage 2 is **Awaiting user testing**. Report any issue for correction; explicitly approve before Stage 3 begins.

## Stage 2 user-test fix — missing mailbox targets/overview — 2026-10-09

Reported ticket: `cmv14eyme000104jyqkh6k7va` (“Testing the shared mail box ticket.”).

- Read-only inspection found an old-style, source-null timer with issue-policy targets **4/9 minutes**, despite configured mailbox/department targets **60/120 minutes**. The missing mailbox marker made the SLA reader reject the timer. This is consistent with an older webhook deployment processing the email against the shared DB; local inbound creation already writes the mailbox timer atomically.
- Added recovery after the ticket SLA API's authentication/access gate. For open email-origin tickets with an absent or non-mailbox timer, recovery resolves mailbox → department → tenant targets, snapshots the working calendar, and attaches the mailbox source. It uses origin routing or the original trusted inbound message's routing envelope for mailbox overrides. It does not invent targets when none are configured.
- Recovery locks the ticket, rechecks completion, and rechecks the timer to avoid competing refreshes overwriting a repaired timer. Closed/deleted/draft tickets, form submissions, and manual tickets remain untouched. Existing clock starts/stops and notification/breach history are retained; recovery itself sends no alerts or escalation.
- Repaired only the user-reported test ticket through this helper. Verified the real SLA reader returns **60 minutes first response**, **120 minutes resolution**, source mailbox, and manager overview details. No notifications/emails or completion hooks were invoked.
- Formal SLA sidebar heading now consistently reads **SLA overview**. UI render verification confirms both target cards (**1h**, **2h**).
- **71 focused tests passed across 5 files**, including legacy envelope lookup, missing-timer recovery, concurrent repair, completion protection, access gating, and rendered mailbox targets. Changed files pass lint and `git diff --check`; typecheck retains only the established departments-page `basePath` error.
- Retest: fully refresh the reported ticket as the super admin or authorized tenant manager. Confirm the header SLA badge and sidebar **SLA overview → First response / Resolution**, targets **1h / 2h**. Time Tracking now displays the saved mailbox resolution target as its estimate (see the later user correction below). Refresh another open email-origin test ticket created by the earlier processor to verify recovery. Deploying this Stage 2 code to the actual webhook instance is still required for that instance to create mailbox snapshots immediately.

Stage 2 remains **Awaiting user testing**; Stage 3 has not started.

## Stage 2 user correction — department-only mailbox SLA and status dropdown — 2026-10-09

- User explicitly removed tenant-level shared-mailbox SLA. The tenant Departments → SLA page no longer mounts the shared-mailbox settings card; that card remains on department SLA settings.
- Removed tenant-policy fallback from mailbox timer preparation and recovery. Targets use a mailbox override within its department, then department mailbox defaults only. If neither is configured, no new mailbox SLA is applied. Form/Portal tenant policy behavior is unchanged. Existing timers retain their saved targets/snapshots.
- Replaced comma-separated status entry with a multiple-selection dropdown populated from the department's current sub-department workflow statuses, deduplicated and excluding completion statuses. Workflows without custom statuses use standard workflow options. Existing case/spelling variants map to the current label. Removed saved statuses remain visible for deselection and must be replaced before saving.
- API rejects arbitrary names outside those workflows. Selecting one or more statuses and saving retains other SLA settings.
- **75 focused tests passed across 4 files**, including no tenant fallback, dynamic status options, completion filtering, canonical default spelling, validation, creation, and recovery regressions. Changed files pass lint; typecheck retains only the known departments-page `basePath` error. No database/schema changes or notifications were used for this correction.
- Retest: refresh `/nur-tenants/departments/sla` and confirm no Shared mailbox SLA card. Open a department's SLA settings and use the active-status dropdown; verify custom noncompletion workflow labels appear and selections persist after saving. In an isolated department with all mailbox/department targets cleared, send a new email and confirm tenant form policies do not supply mailbox SLA targets.

Stage 2 remains **Awaiting user testing**.

## Stage 2 user correction — resolution starts with agent work — 2026-10-09

- User requested the mailbox resolution timer remain stopped initially. First response still starts at email receipt; resolution begins at the first configured active-status entry or explicit work-tracking start. A public reply alone does not activate resolution.
- Stored pending/activation state in the existing mailbox configuration snapshot; no schema migration was needed. Reconciliation uses the earliest qualifying status event/work entry, excluding queue time. It also corrects open older mailbox snapshots while preserving saved stops, notification guards, and breach history. Closed historical snapshots are not recalculated.
- Work timer auto-start and manual start hooks activate resolution after work is persisted. Reads and SLA checks reconcile persisted events for updates from other entry points. Activation is saved once, so later work sessions do not reset its start. Working hours and customer-wait exclusions still apply after activation.
- Pending resolution evaluates to zero, does not warn or breach, and appears as **Awaiting agent work · Not started** with no Started timestamp. Completion before any work stores zero elapsed resolution minutes.
- Verified the reported ticket `cmv14eyme000104jyqkh6k7va` using the real SLA reader: first response running; resolution **0 seconds**, not running, and no resolution start timestamp. This corrected its pending snapshot without sending notifications, creating work sessions, or changing workflow status.
- **84 focused tests passed across 8 files**, covering pending clocks/no resolution breach, active-status and explicit tracking activation, first-response independence, reply-only behavior, older snapshot correction, once-only activation, zero-work completion, and rendered pending labels. Full suite: **1497 passed / 51 failed / 2 skipped**; failing cases match the established baseline. Changed files pass lint; typecheck retains only the known departments-page `basePath` error.
- Retest: refresh the reported ticket. Resolution should show **0m / target 2h**, **2h left**, and **Awaiting agent work · Not started** while First response continues. Move a controlled test ticket to a configured active status (or start work tracking) and confirm resolution begins at that time, excluding initial queue time. A public reply should still stop First response and pause customer-wait time; the subsequent trusted customer reply resumes an already activated resolution clock.

Stage 2 remains **Awaiting user testing**.

## Stage 2 user correction — show resolution target in Time Tracking — 2026-10-09

- Mailbox tickets now use their saved SLA resolution target as the Time Tracking estimate and progress/overtime denominator. The reported ticket's 120-minute target displays as **Estimate 2h** instead of an empty estimate.
- The row identifies this value as **SLA target** and uses the department-configured target rather than exposing a separate Set/Edit action. It shares the existing SLA query/refresh key with the overview, so recovered targets appear without changing ticket personal-estimate rows or issuing database writes. Other ticket types retain their existing estimate behavior.
- **57 SLA regression tests passed across 2 files**. Typecheck retains only the established departments-page `basePath` error; ticket-detail lint retains the same baseline counts by rule (**46 errors / 14 warnings**) and `git diff --check` passes.
- Retest: refresh the reported mailbox ticket. Time Tracking should display **Estimate 2h · SLA target**, matching the Resolution target. As work is tracked, its progress uses that same 2-hour estimate.

Stage 2 remains **Awaiting user testing**.

## Handoff notes

- Current stage: Stage 2, **Awaiting user testing**. Stage 1 is approved.
- Completed work: mailbox-specific target hierarchy, atomic SLA creation, working-calendar snapshots, response/wait lifecycle, warnings/breaches/escalation, final totals, settings, and regression verification.
- Schema/database changes: additive migration `20261009160000_mailbox_sla_stage2` applied and recorded; Prisma Client regenerated.
- Verification and limitations: see Stage 2 results above; existing full-suite/typecheck failures remain outside this stage.
- Next action: wait for user testing and fix reported Stage 2 issues. Do not implement Stage 3 without explicit approval.

Suggested new-session prompt:

> Read AGENTS.md and docs/sla-implementation-plan.md. Stage 2 is awaiting my testing. Address any Stage 2 feedback; do not start Stage 3 until I explicitly approve.
