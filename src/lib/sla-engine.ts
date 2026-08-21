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
import { type WorkingHoursCalendar } from "@/lib/sla-calendar";
import {
  evaluateSlaIndicator,
  planReopen,
  DEFAULT_AT_RISK_PCT,
  type SlaIndicator,
  type SlaTimerState,
} from "@/lib/sla-timer";
import type { ConditionGroup } from "@/lib/rules-engine";
import type { Prisma } from "@/generated/prisma/client";

type SlaConfig = { pauseOutsideHours: boolean; atRiskPct: number };
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
 * Starts first-response + resolution timers for a newly created ticket
 * (SLA-03), if a department SLA policy matches the submitted form values
 * (SLA-01/02). Best-effort — never throws, so a failure here can't block
 * ticket creation.
 */
export async function startSlaTimers(
  ticketId: string,
  tenantId: string,
  departmentId: string,
  formValues: Record<string, unknown>,
  now: Date = new Date(),
  subDepartmentId?: string | null,
): Promise<void> {
  try {
    const policies = await prisma.slaPolicy.findMany({
      // Department-wide policies (subDepartmentId = null) apply to every ticket;
      // a sub-department's own policies apply additionally to its tickets.
      where: {
        departmentId,
        enabled: true,
        OR: subDepartmentId
          ? [{ subDepartmentId: null }, { subDepartmentId }]
          : [{ subDepartmentId: null }],
      },
      select: { id: true, conditions: true, firstResponseMins: true, resolutionMins: true },
    });
    const targets = selectSlaTargets(policies as SlaPolicyLike[], formValues);
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

/** Read-only SLA indicator for a ticket (SLA-06), for the API/UI. Null when no SLA applies. */
export async function getSlaIndicatorForTicket(ticketId: string, now: Date = new Date()): Promise<SlaIndicator | null> {
  const timer = await prisma.slaTimer.findUnique({
    where: { ticketId },
    include: { ticket: { select: { assigneeId: true, subDepartmentId: true, subDepartment: { select: { departmentId: true } } } } },
  });
  if (!timer) return null;

  const departmentId = timer.ticket.subDepartment.departmentId;
  const subDepartmentId = timer.ticket.subDepartmentId;
  const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
  const calendar = await resolveCalendarForTicket(
    { departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId },
    rangeFrom,
    now,
  );
  const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);

  return evaluateSlaIndicator(toTimerState(timer), now, calendar, slaConfig.atRiskPct);
}

/**
 * Checks a ticket's SLA state and fires at-risk/breach notifications the
 * first time each threshold is crossed (SLA-05), recording an immutable
 * SlaBreach row on breach (SLA-07). Deduplicated via the timer's
 * `*NotifiedAt` flags — safe to call repeatedly (on ticket read, or from the
 * cron sweep) without re-notifying. Never auto-escalates or changes ticket
 * status — notification only.
 */
export async function checkAndNotifySla(ticketId: string, now: Date = new Date()): Promise<void> {
  try {
    const timer = await prisma.slaTimer.findUnique({
      where: { ticketId },
      include: {
        ticket: {
          select: {
            id: true,
            assigneeId: true,
            subDepartmentId: true,
            subDepartment: { select: { departmentId: true } },
          },
        },
      },
    });
    if (!timer) return;

    const departmentId = timer.ticket.subDepartment.departmentId;
    const subDepartmentId = timer.ticket.subDepartmentId;
    const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
    const calendar = await resolveCalendarForTicket({ departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId }, rangeFrom, now);
    const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
    const atRiskPct = slaConfig.atRiskPct;

    const indicator = evaluateSlaIndicator(toTimerState(timer), now, calendar, atRiskPct);

    const updates: Prisma.SlaTimerUpdateInput = {};
    const breachRows: { metric: string; targetMins: number }[] = [];

    if (indicator.firstResponse.status !== "ON_TRACK" && timer.firstResponseStoppedAt === null) {
      if (indicator.firstResponse.status === "BREACHED" && timer.firstResponseBreachNotifiedAt === null) {
        updates.firstResponseBreachNotifiedAt = now;
        breachRows.push({ metric: "first_response", targetMins: timer.firstResponseTargetMins });
      } else if (indicator.firstResponse.status === "AT_RISK" && timer.firstResponseAtRiskNotifiedAt === null) {
        updates.firstResponseAtRiskNotifiedAt = now;
      }
    }
    if (indicator.resolution.status !== "ON_TRACK" && timer.resolutionStoppedAt === null) {
      if (indicator.resolution.status === "BREACHED" && timer.resolutionBreachNotifiedAt === null) {
        updates.resolutionBreachNotifiedAt = now;
        breachRows.push({ metric: "resolution", targetMins: timer.resolutionTargetMins });
      } else if (indicator.resolution.status === "AT_RISK" && timer.resolutionAtRiskNotifiedAt === null) {
        updates.resolutionAtRiskNotifiedAt = now;
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

    await notifyRecipients(ticketId, departmentId, timer.ticket.assigneeId, updates);
  } catch {
    // best-effort
  }
}

async function notifyRecipients(
  ticketId: string,
  departmentId: string,
  assigneeId: string | null,
  updates: Prisma.SlaTimerUpdateInput,
): Promise<void> {
  const recipientIds = new Set<string>();
  if (assigneeId) recipientIds.add(assigneeId);
  const managers = await prisma.departmentManager.findMany({
    where: { departmentId },
    select: { userId: true },
  });
  for (const m of managers) recipientIds.add(m.userId);

  const breached = "firstResponseBreachNotifiedAt" in updates || "resolutionBreachNotifiedAt" in updates;
  const type = breached ? "sla_breach" : "sla_at_risk";
  const message = breached ? "SLA breached" : "SLA at risk";

  for (const recipientId of recipientIds) {
    createNotification({ recipientId, type, ticketId, message }).catch(() => undefined);
  }
}

/**
 * Proactively checks every ticket with a still-live SLA timer (at least one
 * metric not yet stopped) for at-risk/breach notifications — used by the
 * cron sweep so notifications fire even when nobody has the ticket open.
 */
export async function sweepSlaChecks(now: Date = new Date()): Promise<number> {
  const timers = await prisma.slaTimer.findMany({
    where: { OR: [{ firstResponseStoppedAt: null }, { resolutionStoppedAt: null }] },
    select: { ticketId: true },
  });
  for (const { ticketId } of timers) {
    await checkAndNotifySla(ticketId, now);
  }
  return timers.length;
}

export type { SlaIndicator } from "@/lib/sla-timer";
export type { SlaPolicyLike, SlaTargets } from "@/lib/sla-policy-match";
export type { ConditionGroup as SlaConditionGroup };
