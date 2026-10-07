/**
 * SLA engine — DB layer (slice 10). Wires the pure modules (sla-policy-match,
 * sla-calendar, sla-timer) to Prisma: starting timers at ticket creation,
 * stopping/resuming them on the events SLA-03/OQ-03 define, and syncing
 * at-risk/breach notifications + immutable SlaBreach rows (SLA-05/07).
 *
 * Mirrors the pure/DB split used by ticket-sub-status.ts + customer-reopen.ts.
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { selectSlaTargets, type SlaPolicyLike } from "@/lib/sla-policy-match";
import { type SlaPauseInterval, type WorkingHoursCalendar } from "@/lib/sla-calendar";
import { waitingForCustomerPauseIntervals } from "@/lib/sla-pause-intervals";
import {
  evaluateSlaIndicator,
  planReopen,
  DEFAULT_AT_RISK_PCT,
  type SlaIndicator,
  type SlaIndicatorView,
  type SlaTimerState,
} from "@/lib/sla-timer";
import type { ConditionGroup } from "@/lib/rules-engine";
import type { Prisma } from "@/generated/prisma/client";

type SlaConfig = {
  pauseOutsideHours: boolean;
  /** Jira-like: pause Time to resolution while waiting for customer. Default true. */
  pauseWhenWaitingForCustomer: boolean;
  atRiskPct: number;
};
type BusinessHours = Pick<WorkingHoursCalendar, "timezone" | "workingDays" | "workStartTime" | "workEndTime">;

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
  workStartTime: "09:00",
  workEndTime: "17:00",
};

function readSlaConfig(value: unknown): SlaConfig {
  const stored = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    pauseOutsideHours: typeof stored.pauseOutsideHours === "boolean" ? stored.pauseOutsideHours : false,
    // Default true (Jira-like) when unset.
    pauseWhenWaitingForCustomer:
      typeof stored.pauseWhenWaitingForCustomer === "boolean" ? stored.pauseWhenWaitingForCustomer : true,
    atRiskPct: typeof stored.atRiskPct === "number" ? stored.atRiskPct : DEFAULT_AT_RISK_PCT,
  };
}

function readBusinessHours(value: unknown): BusinessHours {
  const stored = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    timezone: typeof stored.timezone === "string" ? stored.timezone : DEFAULT_BUSINESS_HOURS.timezone,
    workingDays: Array.isArray(stored.workingDays) ? (stored.workingDays as number[]) : DEFAULT_BUSINESS_HOURS.workingDays,
    workStartTime: typeof stored.workStartTime === "string" ? stored.workStartTime : DEFAULT_BUSINESS_HOURS.workStartTime,
    workEndTime: typeof stored.workEndTime === "string" ? stored.workEndTime : DEFAULT_BUSINESS_HOURS.workEndTime,
  };
}

const toDateKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Resolves the effective SLA settings for a ticket: a sub-department's own
 * `slaConfig`/`businessHours` override the parent department's when present,
 * each falling back independently to the department (then built-in defaults).
 */
async function resolveSlaSettings(
  departmentId: string,
  subDepartmentId?: string | null,
): Promise<{ slaConfig: SlaConfig; businessHours: BusinessHours }> {
  let slaRaw: unknown = null;
  let bhRaw: unknown = null;
  if (subDepartmentId) {
    const sub = await prisma.subDepartment.findUnique({
      where: { id: subDepartmentId },
      select: { slaConfig: true, businessHours: true },
    });
    slaRaw = sub?.slaConfig ?? null;
    bhRaw = sub?.businessHours ?? null;
  }
  if (slaRaw == null || bhRaw == null) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { slaConfig: true, businessHours: true },
    });
    if (slaRaw == null) slaRaw = dept?.slaConfig ?? null;
    if (bhRaw == null) bhRaw = dept?.businessHours ?? null;
  }
  return { slaConfig: readSlaConfig(slaRaw), businessHours: readBusinessHours(bhRaw) };
}

/**
 * Resolves the working-hours calendar to pause SLA timers against (SLA-04),
 * or null when the department doesn't pause outside hours. WH-05: the
 * assignee's own MemberSchedule (+ MemberHoliday) wins when present; the
 * department's business calendar (+ DepartmentHoliday) is the fallback when
 * the ticket is unassigned or the assignee has no schedule configured.
 */
export async function resolveCalendarForTicket(
  params: { departmentId: string; subDepartmentId?: string | null; assigneeId?: string | null },
  rangeFrom: Date,
  rangeTo: Date,
): Promise<WorkingHoursCalendar | null> {
  const { slaConfig, businessHours } = await resolveSlaSettings(
    params.departmentId,
    params.subDepartmentId,
  );
  if (!slaConfig.pauseOutsideHours) return null;

  if (params.assigneeId) {
    const schedule = await prisma.memberSchedule.findUnique({ where: { userId: params.assigneeId } });
    if (schedule) {
      const profile = await prisma.profile.findUnique({
        where: { id: params.assigneeId },
        select: { timezone: true },
      });
      const holidays = await prisma.memberHoliday.findMany({
        where: { userId: params.assigneeId, date: { gte: rangeFrom, lte: rangeTo } },
        select: { date: true },
      });
      return {
        timezone: profile?.timezone || DEFAULT_BUSINESS_HOURS.timezone,
        workingDays: schedule.workingDays,
        workStartTime: schedule.workStartTime,
        workEndTime: schedule.workEndTime,
        holidays: holidays.map((h) => ({ start: toDateKey(h.date), end: toDateKey(h.date) })),
      };
    }
  }

  const departmentHolidays = await prisma.departmentHoliday.findMany({
    where: { departmentId: params.departmentId, startDate: { lte: rangeTo }, endDate: { gte: rangeFrom } },
    select: { startDate: true, endDate: true },
  });
  return {
    ...businessHours,
    holidays: departmentHolidays.map((h) => ({ start: toDateKey(h.startDate), end: toDateKey(h.endDate) })),
  };
}

/**
 * Resolves the ordered SLA-policy tiers that apply to a ticket, strictest scope
 * first, honouring the sub-department-overrides-department-overrides-tenant model:
 *
 *   1. the ticket's sub-department's own policies (`subDepartmentId` set) — a
 *      sub-department with its own SLA overrides the department-wide one;
 *   2. the department's department-level policies (`subDepartmentId` null), or,
 *      when the department has none, the tenant-level defaults it inherits
 *      (policies with a null `departmentId`).
 *
 * The caller tries each tier in order and uses the first whose conditions match
 * the ticket, so a sub-department that has policies which don't match this
 * particular ticket still falls back to the department (then tenant) targets.
 */
async function resolveSlaPolicyTiers(
  tenantId: string,
  departmentId: string,
  subDepartmentId?: string | null,
): Promise<SlaPolicyLike[][]> {
  const select = { id: true, conditions: true, firstResponseMins: true, resolutionMins: true } as const;
  const tiers: SlaPolicyLike[][] = [];

  // Tier 1 — the sub-department's own policies override the department-wide SLA.
  if (subDepartmentId) {
    const subPolicies = await prisma.slaPolicy.findMany({
      where: { departmentId, subDepartmentId, enabled: true },
      select,
    });
    if (subPolicies.length > 0) tiers.push(subPolicies as SlaPolicyLike[]);
  }

  // Tier 2 — department-level policies (subDepartmentId null) override the
  // tenant defaults; a department with none inherits the tenant-level defaults.
  const deptPolicies = await prisma.slaPolicy.findMany({
    where: { departmentId, subDepartmentId: null, enabled: true },
    select,
  });
  if (deptPolicies.length > 0) {
    tiers.push(deptPolicies as SlaPolicyLike[]);
  } else {
    const tenantPolicies = await prisma.slaPolicy.findMany({
      where: { tenantId, departmentId: null, enabled: true },
      select,
    });
    if (tenantPolicies.length > 0) tiers.push(tenantPolicies as SlaPolicyLike[]);
  }

  return tiers;
}

/**
 * Starts first-response + resolution timers for a newly created ticket
 * (SLA-03), if an SLA policy matches the submitted form values (SLA-01/02).
 * Policies resolve via {@link resolveSlaPolicyTiers} — a ticket's sub-department
 * policies override the department-wide SLA, which overrides the tenant-level
 * defaults it otherwise inherits. When
 * `preferredPolicyId` is set (intake issue / request type), that policy's
 * targets are used directly — Jira-style goal for the chosen request type.
 * Best-effort — never throws, so a failure here can't block ticket creation.
 */
export async function startSlaTimers(
  ticketId: string,
  tenantId: string,
  departmentId: string,
  formValues: Record<string, unknown>,
  now: Date = new Date(),
  subDepartmentId?: string | null,
  preferredPolicyId?: string | null,
): Promise<void> {
  try {
    if (preferredPolicyId) {
      // A preferred policy may be department-owned or a tenant-level default;
      // match within the ticket's tenant regardless of scope.
      const preferred = await prisma.slaPolicy.findFirst({
        where: { id: preferredPolicyId, tenantId, enabled: true },
        select: { id: true, firstResponseMins: true, resolutionMins: true },
      });
      if (preferred) {
        await prisma.slaTimer.create({
          data: {
            ticketId,
            tenantId,
            policyId: preferred.id,
            firstResponseTargetMins: preferred.firstResponseMins,
            resolutionTargetMins: preferred.resolutionMins,
            firstResponseStartedAt: now,
            resolutionStartedAt: now,
          },
        });
        return;
      }
    }

    // Sub-department policies override the department-wide SLA, which in turn
    // overrides the tenant-level defaults (resolveSlaPolicyTiers). Try each tier
    // strictest-scope first and use the first whose conditions match this ticket
    // — so a sub-department whose policies don't match still falls back to the
    // department (then tenant) targets.
    const tiers = await resolveSlaPolicyTiers(tenantId, departmentId, subDepartmentId);
    let targets: ReturnType<typeof selectSlaTargets> = null;
    for (const tier of tiers) {
      targets = selectSlaTargets(tier, formValues);
      if (targets) break;
    }
    if (!targets) return;

    await prisma.slaTimer.create({
      data: {
        ticketId,
        tenantId,
        policyId: targets.matchedPolicyIds[0] ?? null,
        firstResponseTargetMins: targets.firstResponseMins,
        resolutionTargetMins: targets.resolutionMins,
        firstResponseStartedAt: now,
        resolutionStartedAt: now,
      },
    });
  } catch {
    // best-effort — SLA timers are additive, never block ticket creation
  }
}

async function loadResolutionPauseIntervals(
  ticketId: string,
  until: Date,
  pauseWhenWaitingForCustomer: boolean,
): Promise<SlaPauseInterval[]> {
  if (!pauseWhenWaitingForCustomer) return [];
  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId, status: { not: "system" } },
    select: { direction: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return waitingForCustomerPauseIntervals(messages, until);
}

/** SLA-03: the first-response timer stops on the first PUBLIC agent message. Idempotent. */
export async function stopFirstResponseOnPublicAgentMessage(ticketId: string, at: Date): Promise<void> {
  try {
    await prisma.slaTimer.updateMany({
      where: { ticketId, firstResponseStoppedAt: null },
      data: { firstResponseStoppedAt: at },
    });
  } catch {
    // best-effort
  }
}

/**
 * Keeps the resolution timer in sync with Ticket.closedAt (the existing,
 * universally-set "resolved" signal): closing stops it; reopening (OQ-03)
 * resumes resolution and starts a fresh first-response cycle via planReopen.
 */
export async function syncResolutionTimerOnClosedAtChange(ticketId: string, closedAt: Date | null): Promise<void> {
  try {
    const timer = await prisma.slaTimer.findUnique({ where: { ticketId } });
    if (!timer) return;

    if (closedAt !== null) {
      if (timer.resolutionStoppedAt !== null) return; // already stopped
      await prisma.slaTimer.update({ where: { ticketId }, data: { resolutionStoppedAt: closedAt } });
      return;
    }

    // Reopen: OQ-03.
    const fields = planReopen(
      { resolutionStartedAt: timer.resolutionStartedAt, resolutionStoppedAt: timer.resolutionStoppedAt },
      new Date(),
    );
    await prisma.slaTimer.update({ where: { ticketId }, data: fields });
  } catch {
    // best-effort
  }
}

function toTimerState(timer: {
  firstResponseTargetMins: number;
  resolutionTargetMins: number;
  firstResponseStartedAt: Date;
  firstResponseStoppedAt: Date | null;
  resolutionStartedAt: Date;
  resolutionStoppedAt: Date | null;
}): SlaTimerState {
  return timer;
}

// Only form-submitted tickets are SLA-eligible. Existing timers on manual
// and mailbox tickets are retained as history but ignored for indicators/alerts.
const SLA_TICKET_SELECT = {
  id: true,
  assigneeId: true,
  subDepartmentId: true,
  subDepartment: { select: { departmentId: true } },
  intake: { select: { id: true } },
} as const satisfies Prisma.TicketSelect;

function isSlaEligible(ticket: {
  intake: { id: string } | null;
}): boolean {
  return ticket.intake !== null;
}

/** Read-only SLA indicator for a ticket (SLA-06), for the API/UI. Null when no SLA applies. */
export async function getSlaIndicatorForTicket(ticketId: string, now: Date = new Date()): Promise<SlaIndicator | null> {
  const timer = await prisma.slaTimer.findUnique({
    where: { ticketId },
    include: { ticket: { select: SLA_TICKET_SELECT } },
  });
  if (!timer || !isSlaEligible(timer.ticket)) return null;

  const departmentId = timer.ticket.subDepartment.departmentId;
  const subDepartmentId = timer.ticket.subDepartmentId;
  const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
  const calendar = await resolveCalendarForTicket(
    { departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId },
    rangeFrom,
    now,
  );
  const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
  const resolutionUntil = timer.resolutionStoppedAt ?? now;
  const resolutionPauses = await loadResolutionPauseIntervals(
    ticketId,
    resolutionUntil,
    slaConfig.pauseWhenWaitingForCustomer,
  );

  return evaluateSlaIndicator(toTimerState(timer), now, calendar, slaConfig.atRiskPct, resolutionPauses);
}

/** How far ahead we probe to decide if a metric's clock is counting *right now*.
 * A running metric's elapsed strictly increases across this window; a stopped or
 * paused (outside-hours / waiting-for-customer) one does not. */
const RUNNING_PROBE_MS = 1000;

/**
 * SLA-06 indicator enriched for live client-side countdown: same status/remaining
 * as {@link getSlaIndicatorForTicket}, plus a per-metric `running` flag and the
 * `asOf` instant. `running` is derived by re-evaluating the metric one second in
 * the future — reusing the exact business-hours + waiting-for-customer math — so
 * the client only ticks the number down while the server clock is actually moving.
 */
export async function getSlaIndicatorViewForTicket(
  ticketId: string,
  now: Date = new Date(),
): Promise<SlaIndicatorView | null> {
  const timer = await prisma.slaTimer.findUnique({
    where: { ticketId },
    include: { ticket: { select: SLA_TICKET_SELECT } },
  });
  if (!timer || !isSlaEligible(timer.ticket)) return null;

  const departmentId = timer.ticket.subDepartment.departmentId;
  const subDepartmentId = timer.ticket.subDepartmentId;
  const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
  const probeEnd = new Date(now.getTime() + RUNNING_PROBE_MS);
  const calendar = await resolveCalendarForTicket(
    { departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId },
    rangeFrom,
    probeEnd,
  );
  const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
  // Extend the pause window to the probe end so an open (still-ongoing)
  // waiting-for-customer pause covers the probe interval, keeping a paused
  // resolution metric from looking "running". Clamping in elapsedCountableMs
  // means this extension never affects the elapsed measured at `now` itself.
  const resolutionUntil = timer.resolutionStoppedAt ?? probeEnd;
  const resolutionPauses = await loadResolutionPauseIntervals(
    ticketId,
    resolutionUntil,
    slaConfig.pauseWhenWaitingForCustomer,
  );

  const state = toTimerState(timer);
  const atNow = evaluateSlaIndicator(state, now, calendar, slaConfig.atRiskPct, resolutionPauses);
  const atProbe = evaluateSlaIndicator(state, probeEnd, calendar, slaConfig.atRiskPct, resolutionPauses);

  return {
    firstResponse: { ...atNow.firstResponse, running: atProbe.firstResponse.remainingMs < atNow.firstResponse.remainingMs },
    resolution: { ...atNow.resolution, running: atProbe.resolution.remainingMs < atNow.resolution.remainingMs },
    overall: atNow.overall,
    asOf: now.toISOString(),
  };
}

/**
 * Checks a ticket's SLA state and fires at-risk/breach notifications the
 * first time each threshold is crossed (SLA-05), recording an immutable
 * SlaBreach row on breach (SLA-07). Deduplicated via the timer's
 * `*NotifiedAt` flags — safe to call repeatedly (on ticket read, or from the
 * cron sweep) without re-notifying.
 *
 * When the Time to First Response SLA is breached while no agent has yet made
 * the required first response (`firstResponseStoppedAt === null`), the ticket
 * is also auto-escalated: moved to the sub-department's "Escalated" status and
 * labelled, recorded in the ActivityLog as an automation-sourced status change.
 * Gated on the same `firstResponseBreachNotifiedAt` flag, so it fires once.
 */
export async function checkAndNotifySla(ticketId: string, now: Date = new Date()): Promise<void> {
  try {
    const timer = await prisma.slaTimer.findUnique({
      where: { ticketId },
      include: {
        ticket: {
          select: SLA_TICKET_SELECT,
        },
      },
    });
    if (!timer || !isSlaEligible(timer.ticket)) return;

    const departmentId = timer.ticket.subDepartment.departmentId;
    const subDepartmentId = timer.ticket.subDepartmentId;
    const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
    const calendar = await resolveCalendarForTicket({ departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId }, rangeFrom, now);
    const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
    const atRiskPct = slaConfig.atRiskPct;
    const resolutionUntil = timer.resolutionStoppedAt ?? now;
    const resolutionPauses = await loadResolutionPauseIntervals(
      ticketId,
      resolutionUntil,
      slaConfig.pauseWhenWaitingForCustomer,
    );

    const indicator = evaluateSlaIndicator(toTimerState(timer), now, calendar, atRiskPct, resolutionPauses);

    const updates: Prisma.SlaTimerUpdateInput = {};
    const breachRows: { metric: SlaMetric; targetMins: number }[] = [];
    // Per-metric notification events, so recipients get a message that names
    // the specific SLA (Time to First Response vs Time to Resolution) and level.
    const events: SlaNotifyEvent[] = [];
    // Set when the Time to First Response SLA breaches while no agent has made
    // the required first response — the trigger for automatic escalation below.
    let firstResponseBreachedUnanswered = false;

    if (indicator.firstResponse.status !== "ON_TRACK" && timer.firstResponseStoppedAt === null) {
      if (indicator.firstResponse.status === "BREACHED" && timer.firstResponseBreachNotifiedAt === null) {
        updates.firstResponseBreachNotifiedAt = now;
        breachRows.push({ metric: "first_response", targetMins: timer.firstResponseTargetMins });
        events.push({ metric: "first_response", level: "breach" });
        firstResponseBreachedUnanswered = true;
      } else if (indicator.firstResponse.status === "AT_RISK" && timer.firstResponseAtRiskNotifiedAt === null) {
        updates.firstResponseAtRiskNotifiedAt = now;
        events.push({ metric: "first_response", level: "at_risk" });
      }
    }
    if (indicator.resolution.status !== "ON_TRACK" && timer.resolutionStoppedAt === null) {
      if (indicator.resolution.status === "BREACHED" && timer.resolutionBreachNotifiedAt === null) {
        updates.resolutionBreachNotifiedAt = now;
        breachRows.push({ metric: "resolution", targetMins: timer.resolutionTargetMins });
        events.push({ metric: "resolution", level: "breach" });
      } else if (indicator.resolution.status === "AT_RISK" && timer.resolutionAtRiskNotifiedAt === null) {
        updates.resolutionAtRiskNotifiedAt = now;
        events.push({ metric: "resolution", level: "at_risk" });
      }
    }

    if (Object.keys(updates).length === 0) return;

    await prisma.$transaction([
      prisma.slaTimer.update({ where: { ticketId }, data: updates }),
      ...breachRows.map((b) =>
        prisma.slaBreach.create({
          data: {
            ticketId,
            tenantId: timer.tenantId,
            timerId: timer.id,
            metric: b.metric,
            targetMins: b.targetMins,
            breachedAt: now,
          },
        }),
      ),
    ]);

    await notifyRecipients(ticketId, departmentId, timer.ticket.assigneeId, events);

    // Auto-escalate on a Time to First Response breach that went unanswered.
    // Best-effort and idempotent: gated by the just-set `firstResponseBreachNotifiedAt`
    // flag so it runs once, and `escalateTicket` no-ops if already escalated.
    // Imported dynamically to avoid a static import cycle (ticket-escalation
    // imports `syncResolutionTimerOnClosedAtChange` from this module). Runs in a
    // system/automation context — no `actorId`/`timerActor`; `activitySource`
    // marks the ActivityLog status change as SLA-driven automation.
    if (firstResponseBreachedUnanswered) {
      try {
        const { escalateTicket } = await import("@/lib/ticket-escalation");
        await escalateTicket(ticketId, {
          activitySource: { kind: "sla_breach", metric: "first_response" },
        });
      } catch {
        // best-effort — a failed escalation must not break the sweep
      }
    }
  } catch {
    // best-effort
  }
}

type SlaMetric = "first_response" | "resolution";
type SlaNotifyEvent = { metric: SlaMetric; level: "breach" | "at_risk" };

const SLA_METRIC_LABEL: Record<SlaMetric, string> = {
  first_response: "Time to First Response",
  resolution: "Time to Resolution",
};

/**
 * Notifies the assignee + department managers, one notification per SLA event,
 * with a message naming the specific metric and level. The renderer
 * (notify.ts, `sla_breach`/`sla_at_risk` cases) prefixes the ticket ref + title,
 * so a resolution breach reads e.g. `ITS-16 "Login bug" exceeded its Time to
 * Resolution SLA`.
 */
async function notifyRecipients(
  ticketId: string,
  departmentId: string,
  assigneeId: string | null,
  events: SlaNotifyEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const recipientIds = new Set<string>();
  if (assigneeId) recipientIds.add(assigneeId);
  const managers = await prisma.departmentManager.findMany({
    where: { departmentId },
    select: { userId: true },
  });
  for (const m of managers) recipientIds.add(m.userId);

  for (const ev of events) {
    const type = ev.level === "breach" ? "sla_breach" : "sla_at_risk";
    const label = SLA_METRIC_LABEL[ev.metric];
    const message =
      ev.level === "breach"
        ? `exceeded its ${label} SLA`
        : `is at risk of breaching its ${label} SLA`;
    for (const recipientId of recipientIds) {
      createNotification({ recipientId, type, ticketId, message }).catch(() => undefined);
    }
  }
}

/**
 * Proactively checks every ticket with a still-live SLA timer (at least one
 * metric not yet stopped) for at-risk/breach notifications — used by the
 * cron sweep so notifications fire even when nobody has the ticket open.
 */
// The sweep runs under system scope (cross-tenant), so it can face every live
// timer on the shared DB. Processing them one-at-a-time against a remote DB
// overruns the 5-min cron cadence (and Vercel's function timeout), so bound the
// work: a small concurrency pool plus a wall-clock budget. checkAndNotifySla is
// idempotent (acts only while a *NotifiedAt column is null), so any timer a run
// doesn't reach is simply picked up by the next run.
const SWEEP_CONCURRENCY = 6;
const SWEEP_BUDGET_MS = 4 * 60_000;

export async function sweepSlaChecks(now: Date = new Date()): Promise<number> {
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  const timers = await prisma.slaTimer.findMany({
    where: { OR: [{ firstResponseStoppedAt: null }, { resolutionStoppedAt: null }] },
    select: { ticketId: true },
    orderBy: { resolutionStartedAt: "asc" }, // oldest (closest to breach) first
  });

  let checked = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < timers.length && Date.now() < deadline) {
      const { ticketId } = timers[cursor++]!;
      await checkAndNotifySla(ticketId, now);
      checked++;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SWEEP_CONCURRENCY, timers.length) }, worker),
  );
  return checked;
}

export type { SlaIndicator } from "@/lib/sla-timer";
export type { SlaPolicyLike, SlaTargets } from "@/lib/sla-policy-match";
export type { ConditionGroup as SlaConditionGroup };
