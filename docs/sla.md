# SLA implementation

Updated from the implementation on 2026-10-12. Stages 1, 3 and 4 are user-approved. Stage 5 is implemented and awaiting user testing/approval. Stage 2's latest duplicate-email and atomic arrival-notification fixes still await final user testing; approval of other stages does not approve those fixes.

## Sources and targets

| Source | Allowed time | First response starts | Resolution starts |
|---|---|---|---|
| Manual | Ticket Estimated Time | No first-response SLA | Actual persisted work sessions |
| Shared mailbox | Mailbox overrides, then department mailbox defaults, independently for each target; no tenant fallback | Email receipt | First configured agent-active status or persisted work session |
| Support form | Explicit selected issue targets | Creation | First persisted work session |
| Portal API | Explicit selected issue targets | Creation | First persisted work session |

Mailbox Time Tracking displays the saved SLA resolution target as its estimate. Manual compliance counts current-cycle work across all users, including running sessions and work outside business hours. Manual tickets have no two-clock `SlaTimer`.

Support accepts submissions without an issue and currently starts no automatic issue SLA for them. Portal requires an issue. Existing automation can independently apply an SLA to eligible form tickets. These policies remain unchanged.

Explicit selected issues take precedence over competing automatic SLA selection. Conditional fallback keeps sub-department precedence, then department-wide policies; tenant fallback applies only when there are no enabled department-wide policies. A department with enabled policies that do not match does not fall through to tenant defaults. Policy conditions and routing/assignment functionality remain intact. `apply_sla` is restricted to policies in the ticket department and may update an existing timer's targets while keeping its starts; ordinary policy edits/priority changes do not rewrite ticket targets.

## Authoritative clocks

`src/lib/sla-engine.ts` uses `sla-timer.ts`, `sla-calendar.ts` and the trusted conversation timeline to calculate SLA elapsed time. New mailbox and Support/Portal timers save targets and a JSON calendar/configuration snapshot (`mailboxConfig`, also used for forms), including timezone, working days, opening/closing times, holidays, active statuses, warning percentage and resolution activation. Assignee changes, department moves and subsequent setting edits do not rewrite this snapshot.

The applicable calendar comes from the assignee schedule/holidays where available, otherwise sub-department/department working hours and holidays, otherwise UTC Monday–Friday 09:00–17:00. The requirements' UK 08:30–17:00 schedule is an example. New mailbox/form clocks always count working hours and exclude customer waits. Calendar intersections account for DST transitions, including repeated and nonexistent local times; overlapping customer waits are merged before subtraction.

First response stops on a trusted customer-facing agent reply/public Portal comment or the first saved configured active-status transition. Internal notes, system messages and quarantined mail do not qualify. In Progress satisfies first response immediately when configured as active. Support/Portal resolution requires a persisted `TimeEntry`; a reply or status change alone cannot activate it. An eligible active-status transition may start work tracking, which then activates resolution.

Customer-facing outbound conversation starts Waiting for Customer; a trusted customer reply gives Waiting for Assignee and resumes resolution. These are derived labels and do not automatically change the main workflow status. Existing explicit Waiting for Customer workflow transitions also define pauses. Customer waits do not pause first response. Stopping an individual work session after SLA activation does not by itself stop the mailbox/form calendar clock; manual SLA counts actual work only.

Completion uses the ticket's `closedAt`, stops running work at that instant, and freezes mailbox/form SLA clocks. Work ending late cannot count beyond completion. Completion also checks final breaches with mocked delivery in automated verification. Closing without a qualifying response freezes the outstanding first-response clock at closure; the stop timestamp alone does not prove a public reply occurred.

## Reopen and breach history

Customer replies leave closed tickets closed. The assignee moving the ticket to In Progress begins a fresh SLA/work cycle. The guarded reset transaction preserves targets, calendars, historical work entries and all `SlaBreach` rows, while resetting starts, activation, completion results and warning/breach guards. A `TIMER_RESET` activity (`reopenCycle: true`) marks the new work boundary. Current tracked totals exclude entries from previous cycles. In Progress may immediately satisfy the fresh first-response clock; source-specific resolution activation still applies.

Threshold claims compare cycle timestamps. Manual estimate claims also compare the saved In Progress boundary, preventing a checker from a prior cycle claiming a reopened ticket's guard. Each new cycle can warn/breach again. `SlaBreach` retains the metric, target at detection, and detection timestamp; it is never rewritten or deleted by SLA reporting/reopen. No separate completed-cycle summary archive is introduced: historical work and breach records are retained, while the live timer and ticket completion projection describe the latest cycle.

## Reporting

The authoritative resolution calculation is shared by completion persistence and resolution-time reports:

- Mailbox, Support and Portal: working elapsed from resolution activation to closure, excluding customer waits using the saved calendar. Pending/unworked resolution is zero.
- Manual: current-cycle tracked seconds up to closure, regardless of business hours.
- Without an eligible SLA, non-manual tickets retain the legacy creation-to-close turnaround sample in aggregate reports. This is not an SLA compliance verdict.

`Ticket.resolutionDurationMins` is a rounded whole-minute projection. `resolvedWithinAllowed` uses the authoritative result before rounding, so one second over a one-minute allowance remains noncompliant even if duration displays as one whole minute. The status-update helper no longer substitutes a wall-clock result for a formal SLA. Completion hooks can refresh a missed projection on repeat invocation. Existing historical projections are not mass-backfilled.

`reporting/resolution-time-report.ts` recalculates eligible SLA/manual samples for mean/median reports and exports rather than subtracting raw SLA timestamps or trusting stale historical projections. Database fan-out is bounded to six tickets per batch. It uses read-only, in-memory reconciliation of saved status/work history; it does not persist repairs, claim notification guards, send notifications or run the sweep. Reports include the latest resolved cycle for tickets whose current `closedAt` falls in the selected period, not one row per past cycle. Large reports require additional per-ticket reads and may be slower than the old timestamp-only query.

The privileged ticket-detail SLA overview and `GET /api/tickets/[id]/sla` expose allowed time, actual first-response time where applicable, active resolution/current manual tracked time, overtime and completed compliance. `indicator.details.report` contains exact milliseconds and nullable completion verdicts:

- `firstResponse` and `resolution`: `allowedMs`, `actualMs`, `overtimeMs`, `compliant` (null until stopped).
- `customerWaitingMs`: elapsed customer waiting across the current cycle, clipped at completion; includes outside-hours waiting.
- `resolutionWaitingMs`: working-calendar customer waiting excluded after resolution activation; zero while resolution is pending.
- `cycleStartedAt`: current SLA cycle boundary.

Manual overview exposes `estimatedMins`, `trackedSecs`, `overtimeSecs`, and `details.compliant`/`cycleStartedAt`; it does not invent a first-response or calendar waiting metric. UI durations include seconds, and completed cards show Met/Breached. Current-cycle timelines filter prior breaches out, with a separate expandable **Breach history · all cycles** list showing every recorded target and detection date. Previous breaches never change the current cycle's compliance verdict.

Full breakdown/history remains restricted to tenant admins/managers, super admins and the ticket department's admins/managers; authorized agents get the badge summary. Existing ticket access controls apply. SLA settings/policy permissions and feature gates are unchanged.

## Detection, notifications and cadence

`vercel.json` schedules `/api/cron/sla-check` every **15 minutes**, protected by `CRON_SECRET` and system scope. The sweep processes live timers with a six-worker pool and four-minute budget, followed by applicable manual estimate checks. Unprocessed work waits for a later invocation. Local `scripts/run-sla-cron.sh` calls the same shared sweep; do not use it for testing on the team's live database. The inspected local crontab was empty; an existing `next dev` server was running and was not restarted.

The sweep and applicable work/reply/status/completion hooks check thresholds. Default early warning is 80%, configurable in saved SLA settings. First response breaches at the target; mailbox/form resolution and manual estimates breach strictly after exceeding the target. Overtime continues after breach. Notifications go to the assignee, department managers and active tenant managers, deduplicating recipients; sub-department managers are not independently added. Unanswered first-response breaches use the existing escalation path; late answered breaches retain history without escalating an answered ticket.

Warning/breach claims and breach insertion are transactional. Repeated/concurrent checks cannot issue the same threshold twice per cycle. Delivery is best-effort after persistence, without a durable retry queue. A failed delivery may leave a claimed guard without a delivered notification. `breachedAt` records detection time, not an exact reconstructed crossing time.

A 15-minute cadence cannot guarantee early warnings for targets shorter than a sweep interval or when warning and breach happen between checks. Such a check emits the breach instead of a retrospective warning. Detection can lag up to the next scheduled invocation and longer with backlog/runtime delays. Live UI polling is independent of persisted alerts. The deployment schedule is unchanged; no stricter delivery latency was invented.

## Cleanup and historical limits

Removed only the commented, unreachable `SlaRule` seed example after checking application/schema/migration references. The unused engine model remains in the schema/shared DB because dropping it is destructive and unnecessary. Policy assignment fields still have settings/API compatibility references and were retained. Conditional selection, sub-department precedence, routing and assignment were not removed. No schema change or migration was needed; already-applied migrations `20261009160000_mailbox_sla_stage2` and `20261012083000_mailbox_receipt_guard` were not reapplied.

Older timers without snapshots retain runtime-calendar fallback: their original schedules cannot be reconstructed from current settings. Historical projections may remain stale, but reports recalculate from available saved history. No historical breach targets/dates were changed, duplicate emails deleted, or old completed cycles backfilled. The Stage 2 duplicate-email protection and atomic arrival-notification transaction remain unchanged and require final user testing.

## Verification and user testing

Automated verification mocks database operations, alerts, email delivery and broadcasts. It covers authoritative completed reporting, second-level boundaries, weekend/customer waits, current-cycle work, retained breach history, concurrent claims, read-only exports and mailbox duplicate/arrival regressions. See [sla-implementation-plan.md](sla-implementation-plan.md) for final counts and baseline comparison.

Use an isolated test department/mailbox and controlled assignee/manager inboxes, with completion/notification delivery captured. Do not modify real team tickets or manually invoke the shared sweep.

1. Complete controlled manual, mailbox, Support and Portal tickets. Compare the overview/API allowed time, actual first response (where applicable), active/tracked resolution, waiting, overtime and Met/Breached with recorded work/conversation times.
2. Include a weekend or outside-hours span and repeated outbound replies before a customer response. Customer waiting elapsed may exceed excluded working time; active resolution must subtract only the latter, without double counting. Manual outside-hours work still counts fully.
3. Test resolution exactly at its allowance and one second over. Exact allowance is compliant for mailbox/form/manual; excess is not. Confirm completion does not turn a business-hours result into wall-clock time. Refresh later to verify frozen totals.
4. Compare resolution-time mean/median and exports for the selected completion period against exact per-ticket active/tracked durations. Aggregate UI rounds displayed minutes; exported/statistical samples retain fractional minutes. Historical timers without calendars have the reconstruction limitation above.
5. Reopen a controlled ticket through the assignee's In Progress change. Verify zero current work, fresh guards, retained targets/calendar, and prior breach targets/dates in all-cycle history. Resolve again and confirm reports use the new cycle only. Customer replies alone must leave it closed.
6. Verify threshold checks with mocked delivery/clock or an isolated deployment. Repeated/concurrent checks should produce one warning/breach per metric/cycle, preserve history and allow a new cycle's alert. Verify normal unattended detection against the deployed scheduler without calling the team's shared sweep. Short targets may skip early warning as documented.
7. Retest Stage 2's duplicate receipt and atomic arrival behavior separately before granting its pending approval. Check existing assignment, conditional policies and report exports still work.

Stop here for Stage 5 user testing and approval.
