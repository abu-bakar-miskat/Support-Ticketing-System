# SLA (Service Level Agreement): how it works today

> Status: written from the code on 2026-10-08. It describes **current behavior**, not the intended design.
> Main code: `src/lib/sla-engine.ts` (database layer), with the pure helpers `sla-timer.ts`, `sla-calendar.ts`, `sla-policy-match.ts` and `sla-pause-intervals.ts`.

## 1. Overview

Each ticket can have one SLA with two clocks:

| Metric | Label in the UI and notifications | Starts | Stops |
|---|---|---|---|
| First response | Time to First Response | Ticket creation | First **public** agent reply |
| Resolution | Time to Resolution | Ticket creation | Ticket reaches a completion status (`closedAt` set) |

Each clock has one of three statuses:
- **ON_TRACK**
- **AT_RISK**: elapsed time is at or above `atRiskPct`% of the target (default 80%).
- **BREACHED**: elapsed time is at or above the target.

The overall status is the worse of the two clocks.

The data lives in these models:
- `SlaPolicy`: the targets, in minutes.
- `SlaTimer`: one row per ticket, holding only start and stop timestamps.
- `SlaBreach`: an append-only breach history.

Elapsed time is **never stored**. It is recalculated on every read from the start time, the stop time (or now if still running), the working calendar and any pause intervals.

## 2. Where SLA applies

| Ticket source | Gets an SLA? | How |
|---|---|---|
| Public support form (`/api/support/[uuid]/submit`) | **Only if the submitter picked an issue** that is backed by an SLA policy | `createTicketFromPayload` → `startSlaTimers(..., preferredPolicyId)` |
| Portal API (`/api/portal/v1/form/submissions`) | Same as the support form; it uses the same `createTicketFromPayload` | |
| Manually created ticket (`POST /api/tickets`) | **No** | Rules run with `allowSla: false`, so the `apply_sla` action is removed |
| Mailbox (inbound email) ticket | **No** | `mailbox-ticket-creation.ts` passes `allowSla: false` |

Eligibility is also checked when the SLA is read. In `sla-engine.ts`, `isSlaEligible` requires `ticket.intake !== null`. If a non-form ticket somehow has an `SlaTimer`, the system ignores it: no badge, no alerts and no escalation.

If a support-form submission has no issue, no SLA is started on purpose. The code comment says this is to avoid "invisible" timers that could later auto-escalate the ticket.

## 3. SLA policies (targets)

An `SlaPolicy` has these fields:
- `name`
- `firstResponseMins`
- `resolutionMins`
- `enabled`
- `order`
- `conditions`, a rules-engine `ConditionGroup`

**A policy also acts as a support-form "issue" (request type):**
- `formConfigId` is the form the issue was created on.
- `priority` is the ticket priority set when this issue is chosen. If it is not set, the priority is Medium.
- `subDepartmentId` (the DB column is `teamId`) is an optional sub-department the ticket is routed to.
- The policy's `resolutionMins` also becomes the ticket's estimated minutes.
- `assigneeId`, `SlaPolicyAssignee` and `assigneeRotaPointer` are **legacy and retired**. Person assignment now happens through department assignment methods and rules.

**Policy scopes:**
- **Tenant default**: `departmentId = null`.
- **Department policy**: `departmentId` is set and `subDepartmentId` is null.
- **Sub-department policy**: both are set.

The targets are **copied onto the `SlaTimer` when it is created**. Editing a policy later does not change tickets that already exist.

## 4. Which policy wins

### 4a. Support-form path (the only path used in practice)

The submitter's chosen issue (`issueId`) is looked up within the form's tenant. Any of these is accepted: an issue on this form, a policy of this department, or a tenant-level policy. Its targets are then applied **directly**, and its `conditions` are **not evaluated**.

### 4b. Fallback tiers (`resolveSlaPolicyTiers`)

The fallback is only used if the preferred policy is not found. It tries each tier in order and stops at the first tier with a matching policy:
1. The sub-department's own enabled policies.
2. The department's enabled policies (with `subDepartmentId` null). If the department has **none**, the tenant defaults are used instead. A department with any policies of its own fully overrides the tenant defaults.

Within a tier, every policy whose `conditions` match the form values counts. The **most restrictive target is chosen for each metric separately**: the minimum first-response target and the minimum resolution target. Empty conditions match everything; for example, `conditionsForPriority(null)` gives the catch-all "Standard" policy.

> In practice, the intake path only calls `startSlaTimers` when an issue was resolved. That issue is always found, so tier matching almost never runs.

### 4c. Automation rule action `apply_sla`

A rule can apply a policy to a form ticket (`rule-executor.ts`):
- The policy must belong to the **same department**, so tenant-level policies cannot be applied by a rule.
- The rule upserts the timer. On an existing timer it changes the targets and `policyId` but **keeps the original start times**.

## 5. Timer behavior

### Start
Both clocks start at the ticket's `createdAt`.

### First response stops
The first-response clock stops on the first public agent message (`stopFirstResponseOnPublicAgentMessage`, which only ever stops it once):
- An outbound email reply (`/api/tickets/[id]/messages`).
- A comment with `portalVisible = true` (`/api/tickets/[id]/comments`). On portal tickets, this is the reply thread the requester sees.
- Internal comments do **not** stop it.

### Resolution stops and reopens
The resolution clock follows `Ticket.closedAt` through `syncResolutionTimerOnClosedAtChange`. This is called from:
- The status, move and escalate routes.
- Cascade close of sub-tickets.
- GitHub status advance.
- Customer reopen.

When a ticket is **reopened** (`planReopen`):
- **Resolution resumes.** `resolutionStartedAt` is moved forward by the time the ticket spent closed, so that time is not counted.
- **First response starts a fresh cycle.** It gets a new start time and its at-risk and breach flags are cleared.

### Pauses

**Outside business hours.** Only when `slaConfig.pauseOutsideHours = true`, which is **off by default**. The calendar used is:
1. The assignee's own `MemberSchedule` and `MemberHoliday`, in the assignee's profile timezone.
2. Otherwise, the sub-department's or department's `businessHours` and `DepartmentHoliday`.
3. Otherwise, the built-in default: **UTC, Monday to Friday, 09:00 to 17:00**.

This pause applies to both clocks.

**Waiting for customer.** Only when `slaConfig.pauseWhenWaitingForCustomer = true`, which is **on by default**. It applies to **resolution only**:
- Each outbound non-system message starts a pause.
- The pause lasts until the next inbound customer message.
- Messages with `status: "system"` are ignored.

### Settings resolution

`slaConfig` and `businessHours` are set on the **sub-department**, which overrides the **department**, which falls back to the built-in defaults. `slaConfig` and `businessHours` fall back independently of each other.

| Setting | Default |
|---|---|
| `pauseOutsideHours` | false |
| `pauseWhenWaitingForCustomer` | true |
| `atRiskPct` | 80 |

## 6. At-risk, breach, notifications and escalation

`checkAndNotifySla(ticketId)` runs from:
- The cron sweep (`/api/cron/sla-check`, every 15 minutes in `vercel.json`, protected by `CRON_SECRET` and run under system scope).
- `scripts/run-sla-cron.sh` locally.

The sweep:
- Processes the oldest live timers first.
- Runs 6 at a time.
- Has a 4-minute time budget. Timers it does not reach are picked up on the next run.

For each running clock, it acts **once per threshold**, using the `*AtRiskNotifiedAt` and `*BreachNotifiedAt` columns to avoid repeats:
- **At risk**: sends an `sla_at_risk` notification, for example "is at risk of breaching its Time to Resolution SLA".
- **Breach**: sends an `sla_breach` notification and inserts an `SlaBreach` row, which is never edited or deleted.
- **Recipients**: the ticket's assignee plus **department managers** (`DepartmentManager`). Sub-department managers are not included.
- **Auto-escalation**: when **first response** breaches with no agent reply yet, `escalateTicket` moves the ticket to the sub-department's "Escalated" status and adds the "Escalated" label. The ActivityLog records this as automation (`activitySource: sla_breach`). Moving the ticket to "In Progress" later removes the Escalated label.

## 7. Roles and permissions

| Action | Who | Gate |
|---|---|---|
| Tenant-default policies (CRUD) | Tenant admins | `requireAdmin` in `/api/tenant/sla-policies` |
| Department policies (create, edit, delete) | Tenant or department admins | `canAdminDeptSettings` |
| Department policies (read) | Members in scope, or admins | `departmentIdInScope` or `canAdminDeptSettings` |
| SLA settings (`slaConfig`, business hours) | Same as policy writes | `/api/departments/[id]/sla-settings` |
| Creating policies | Only when the tenant has the **`slaPolicies`** feature enabled | `assertFeatureEnabled` |

Managers may also manage support forms and their issues (see `managers-can-manage-support-forms`).

The UI pages are:
- `/settings/sla`
- `/settings/sla-defaults` (tenant defaults)
- `/settings/departments/[id]/sla`
- `/departments/sla` (the tenant-level Departments shell)
- The support-form / support-template configuration

## 8. Reporting and UI

- **Ticket detail page**: `SlaIndicatorBadge` shows On track, At risk or Breached with a live countdown. Data comes from `GET /api/tickets/[id]/sla` (`getSlaIndicatorViewForTicket`). The response includes a `running` flag per clock, so the client only counts down while the clock is actually running (not paused or stopped).
- **Resolution tracking** (`lib/resolution-tracking.ts`) is separate from the SLA timer:
  - On close, it stores `resolutionDurationMins`, measured as wall-clock time from **first entering "In Progress"** to `closedAt`.
  - It also stores `resolvedWithinAllowed`, comparing that duration to the SLA `resolutionTargetMins`, or to `estimatedTime` if there is no SLA.
- `SlaBreach` holds the breach history for reports.

## 9. Edge cases and known gaps (observed in code)

1. **Two different "resolution" measures.** The SLA timer counts from creation and respects pauses and business hours. `resolvedWithinAllowed` counts from In Progress, uses wall-clock time and ignores pauses. The two can disagree.
2. **The calendar is recalculated using the current assignee** for the ticket's whole lifetime. Reassigning a ticket to someone with a different schedule changes past elapsed time, and can flip a status backwards.
3. **Changing priority or moving the ticket does not recalculate targets.** Targets are fixed when the ticket is created; only the `apply_sla` rule action changes them. Moving to another sub-department does change which pause and business-hours settings are read.
4. **Resolution alerts do not fire again after a reopen.** `planReopen` only clears the first-response flags, so a resolution clock that breached before closing will not send a new at-risk or breach notification.
5. **Policy `conditions` are mostly unused** on the form path, because the chosen issue's targets are applied directly.
6. **`apply_sla` cannot use tenant-level policies**, because the lookup filters on `departmentId`.
7. **Manual and mailbox tickets never get an SLA.**
8. **Default seeding was removed (2026-09-24).** New departments start with no policies, so a department with no issues configured has no SLA at all.
9. **Legacy leftovers:** the `SlaRule` model (per-priority targets) is no longer used by the engine, and the `SlaPolicyAssignee` and `assigneeRotaPointer` fields are retired.
10. **Cron cadence mismatch.** A code comment mentions a "5-min cron cadence", but `vercel.json` schedules `sla-check` every 15 minutes. At-risk and breach alerts can therefore arrive up to about 15 minutes late. The badge itself is always live.
11. **Shared database hazard.** The local SLA crontab plus hot reload in `next dev` applies code edits against the **shared production database** within about a minute. Check the impact before changing sweep or notification code.

## 10. Open questions (to confirm with product owner)

- Should manual and mailbox tickets get an SLA?
- Should first response also pause while waiting for the customer?
- Should business-hours pausing be on by default?
- Should sub-department managers receive SLA alerts?
- Should a priority change recalculate the SLA targets?
- Which "resolution time" is the official one for reporting?
