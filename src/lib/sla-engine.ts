import { normalizeStatus } from "@/components/board/board-types";
import { broadcastTicketEvent } from "@/lib/ticket-events";
import { readFormSlaSnapshot, FORM_SLA_SOURCE } from "@/lib/form-sla";
import { readMailboxSnapshot, isMailboxActiveStatus, mailboxWaitingIntervals, statusDestination, isWaitingForCustomer, type MailboxSlaSnapshot } from "@/lib/mailbox-sla";
import { finalizeManualResolution, stopTicketWorkAt, manualTicketWhere } from "@/lib/manual-resolution";
import { checkAndNotifyEstimateOverrun } from "@/lib/time-estimate-notify";
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
import { loadPortalConversation } from "@/lib/portal-conversation";
import {
  evaluateSlaIndicator,
  planReopen,
  DEFAULT_AT_RISK_PCT,
  type SlaIndicator,
  type SlaIndicatorView,
  type SlaTimerState,
} from "@/lib/sla-timer";
import type { ConditionGroup } from "@/lib/rules-engine";
import { Prisma } from "@/generated/prisma/client";

type SlaConfig = {
  pauseOutsideHours: boolean;
  /** Jira-like: pause Time to resolution while waiting for customer. Default true. */
  pauseWhenWaitingForCustomer: boolean;
  atRiskPct: number;
  mailboxActiveStatuses: string[];
  firstResponseActiveStatuses: string[];
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
    firstResponseActiveStatuses: Array.isArray(stored.firstResponseActiveStatuses) ? stored.firstResponseActiveStatuses.filter((status): status is string => typeof status === "string") : ["In Progress"],
    mailboxActiveStatuses: Array.isArray(stored.mailboxActiveStatuses) ? stored.mailboxActiveStatuses as string[] : ["In Progress"],
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
  params: { departmentId: string; subDepartmentId?: string | null; assigneeId?: string | null; forceWorkingHours?: boolean },
  rangeFrom: Date,
  rangeTo: Date,
): Promise<WorkingHoursCalendar | null> {
  const { slaConfig, businessHours } = await resolveSlaSettings(
    params.departmentId,
    params.subDepartmentId,
  );
  if (!slaConfig.pauseOutsideHours && !params.forceWorkingHours) return null;

  if (params.assigneeId) {
    const schedule = await prisma.memberSchedule.findUnique({ where: { userId: params.assigneeId } });
    if (schedule) {
      const profile = await prisma.profile.findUnique({
        where: { id: params.assigneeId },
        select: { timezone: true },
      });
      const holidays = await prisma.memberHoliday.findMany({
        where: { userId: params.assigneeId, ...(params.forceWorkingHours ? {} : { date: { gte: rangeFrom, lte: rangeTo } }) },
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
    where: { departmentId: params.departmentId, ...(params.forceWorkingHours ? {} : { startDate: { lte: rangeTo }, endDate: { gte: rangeFrom } }) },
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
  options: { assigneeId?: string | null } = {},
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
        const snapshot = await prepareFormSlaSnapshot(departmentId, subDepartmentId, now, options.assigneeId);
        await prisma.slaTimer.create({
          data: {
            source: FORM_SLA_SOURCE, mailboxConfig: snapshot,
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

    const snapshot = await prepareFormSlaSnapshot(departmentId, subDepartmentId, now, options.assigneeId);
    await prisma.slaTimer.create({
      data: {
        source: FORM_SLA_SOURCE, mailboxConfig: snapshot,
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

/** Form timers reuse the existing JSON snapshot column; targets remain issue-owned.
 * The schema column name is historical. Form resolution waits for work tracking. */
async function prepareFormSlaSnapshot(departmentId: string, subDepartmentId: string | null | undefined, now: Date, assigneeId?: string | null): Promise<Prisma.InputJsonValue> {
  const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
  const calendar = await resolveCalendarForTicket({ departmentId, subDepartmentId, assigneeId, forceWorkingHours: true }, now, now);
  return { calendar, resolutionActivatedAt: null, atRiskPct: slaConfig.atRiskPct, activeStatuses: slaConfig.firstResponseActiveStatuses } as unknown as Prisma.InputJsonValue;
}

/** Marks timers started from a department's shared-mailbox SLA. */
export const MAILBOX_SLA_SOURCE = "mailbox";

/** Resolve mailbox override → department mailbox defaults. Tenant policies never apply. */
export async function prepareMailboxSla(
  tenantId: string, departmentId: string,
  options: { mailboxConnectionId?: string | null; subDepartmentId?: string | null; assigneeId?: string | null; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const dept = await prisma.department.findUnique({
    where: { id: departmentId, tenantId },
    select: { slaConfig: true, mailboxFirstResponseMins: true, mailboxResolutionMins: true },
  });
  if (!dept) return null;
  const mailbox = options.mailboxConnectionId ? await prisma.mailboxConnection.findFirst({
    where: { id: options.mailboxConnectionId, departmentId, tenantId },
    select: { slaFirstResponseMins: true, slaResolutionMins: true },
  }) : null;
  const first = mailbox?.slaFirstResponseMins ?? dept.mailboxFirstResponseMins;
  const resolution = mailbox?.slaResolutionMins ?? dept.mailboxResolutionMins;
  const targetSource: MailboxSlaSnapshot["targetSource"] = mailbox?.slaFirstResponseMins && mailbox.slaResolutionMins ? "mailbox" : "department";
  if (!first || !resolution) return null;
  const { slaConfig } = await resolveSlaSettings(departmentId, options.subDepartmentId);
  const calendar = await resolveCalendarForTicket({
    departmentId, subDepartmentId: options.subDepartmentId, assigneeId: options.assigneeId, forceWorkingHours: true,
  }, now, new Date(now.getTime() + 366 * 24 * 60 * 60_000));
  const snapshot: MailboxSlaSnapshot = {
    calendar: calendar!, resolutionActivatedAt: null, atRiskPct: slaConfig.atRiskPct,
    activeStatuses: readSlaConfig(dept.slaConfig).mailboxActiveStatuses, targetSource,
  };
  return {
    tenantId, source: MAILBOX_SLA_SOURCE, firstResponseTargetMins: first, resolutionTargetMins: resolution,
    firstResponseStartedAt: now, resolutionStartedAt: now,
    mailboxConfig: snapshot as unknown as Prisma.InputJsonValue,
  };
}

/** Legacy caller wrapper; inbound creation persists the prepared SLA in its transaction. */
export async function startMailboxSlaTimer(
  ticketId: string, tenantId: string, departmentId: string, now: Date = new Date(),
): Promise<void> {
  const plan = await prepareMailboxSla(tenantId, departmentId, { now });
  if (plan) await prisma.slaTimer.create({ data: { ticketId, ...plan } });
}

async function reconcileFirstResponseActiveStatus(timer: {
  ticketId: string; source: string | null; firstResponseStartedAt: Date; firstResponseStoppedAt: Date | null; mailboxConfig?: unknown;
  ticket: { intake?: { id: string } | null; subDepartmentId: string; subDepartment: { departmentId: string } };
}, until: Date) {
  if ((timer.source !== MAILBOX_SLA_SOURCE && !timer.ticket.intake) || timer.firstResponseStoppedAt) return;
  const snapshot = timer.source === MAILBOX_SLA_SOURCE ? readMailboxSnapshot(timer.mailboxConfig) : readFormSlaSnapshot(timer.mailboxConfig);
  const settings = snapshot ? null : (await resolveSlaSettings(timer.ticket.subDepartment.departmentId, timer.ticket.subDepartmentId)).slaConfig;
  const active = snapshot?.activeStatuses ?? (timer.source === MAILBOX_SLA_SOURCE ? settings!.mailboxActiveStatuses : settings!.firstResponseActiveStatuses);
  const events = await prisma.activityLog.findMany({
    where: { ticketId: timer.ticketId, action: "STATUS_CHANGED", createdAt: { gte: timer.firstResponseStartedAt, lte: until } },
    select: { createdAt: true, metadata: true }, orderBy: { createdAt: "asc" },
  });
  const acted = events.find((event) => { const status = statusDestination(event.metadata); return status && isMailboxActiveStatus(status, active); });
  if (acted) {
    await stopFirstResponseOnPublicAgentMessage(timer.ticketId, acted.createdAt);
    timer.firstResponseStoppedAt = acted.createdAt;
  }
}

/** Begin mailbox resolution only when agent work starts, independent of reply.
 * Reconciliation also heals timers made by earlier webhook deployments. */
async function reconcileMailboxResolutionStart(timer: {
  ticketId: string; source: string | null; mailboxConfig?: unknown;
  firstResponseStartedAt: Date; resolutionStartedAt: Date; resolutionStoppedAt: Date | null;
  ticket: { assigneeId: string | null; closedAt?: Date | null; subDepartmentId: string; subDepartment: { departmentId: string } };
}, until: Date, finalizing = false) {
  if (timer.source !== MAILBOX_SLA_SOURCE) return;
  let snapshot = readMailboxSnapshot(timer.mailboxConfig);
  if (snapshot?.resolutionActivatedAt || (timer.ticket.closedAt && !finalizing)) return;
  if (!snapshot) {
    const runtime = await runtimeForTimer(timer, timer.firstResponseStartedAt, until);
    if (!runtime.calendar) return;
    snapshot = { calendar: runtime.calendar, atRiskPct: runtime.slaConfig.atRiskPct, activeStatuses: runtime.slaConfig.mailboxActiveStatuses, targetSource: "department" };
  }
  const [history, work] = await Promise.all([
    prisma.activityLog.findMany({
      where: { ticketId: timer.ticketId, action: "STATUS_CHANGED", createdAt: { gte: timer.firstResponseStartedAt, lte: until } },
      orderBy: { createdAt: "asc" }, select: { createdAt: true, metadata: true },
    }),
    prisma.timeEntry.findFirst({
      where: { ticketId: timer.ticketId, startedAt: { gte: timer.firstResponseStartedAt, lte: until } },
      orderBy: { startedAt: "asc" }, select: { startedAt: true },
    }),
  ]);
  const active = history.find((event) => {
    const status = statusDestination(event.metadata);
    return status && isMailboxActiveStatus(status, snapshot.activeStatuses);
  })?.createdAt;
  const began = [active, work?.startedAt].filter((value): value is Date => !!value).sort((a, b) => a.getTime() - b.getTime())[0];
  if (!began && snapshot.resolutionActivatedAt === null) return;
  const updatedSnapshot = { ...snapshot, resolutionActivatedAt: began?.toISOString() ?? null };
  const claimed = await prisma.slaTimer.updateMany({
    where: { ticketId: timer.ticketId, source: MAILBOX_SLA_SOURCE, resolutionStartedAt: timer.resolutionStartedAt, mailboxConfig: { equals: timer.mailboxConfig == null ? Prisma.DbNull : timer.mailboxConfig as Prisma.InputJsonValue } },
    data: { mailboxConfig: updatedSnapshot as unknown as Prisma.InputJsonValue, ...(began ? { resolutionStartedAt: began } : {}) },
  });
  if (claimed.count) {
    timer.mailboxConfig = updatedSnapshot;
    if (began) timer.resolutionStartedAt = began;
  } else {
    const current = await prisma.slaTimer.findUnique({ where: { ticketId: timer.ticketId }, select: { mailboxConfig: true, resolutionStartedAt: true } });
    if (current) {
      timer.mailboxConfig = current.mailboxConfig;
      timer.resolutionStartedAt = current.resolutionStartedAt;
    }
  }
}

/** Support/Portal resolution starts only at a persisted work session, never
 * merely at creation, a public reply, or a configured active status. */
async function reconcileFormResolutionStart(timer: {
  ticketId: string; source: string | null; mailboxConfig?: unknown;
  firstResponseStartedAt: Date; resolutionStartedAt: Date;
}, until: Date) {
  if (timer.source !== FORM_SLA_SOURCE) return;
  const snapshot = readFormSlaSnapshot(timer.mailboxConfig);
  if (!snapshot || snapshot.resolutionActivatedAt) return;
  const work = await prisma.timeEntry.findFirst({
    where: { ticketId: timer.ticketId, startedAt: { gte: timer.firstResponseStartedAt, lte: until } },
    orderBy: { startedAt: "asc" }, select: { startedAt: true },
  });
  if (!work) return;
  const updatedSnapshot = { ...snapshot, resolutionActivatedAt: work.startedAt.toISOString() };
  const claimed = await prisma.slaTimer.updateMany({
    where: { ticketId: timer.ticketId, source: FORM_SLA_SOURCE, resolutionStartedAt: timer.resolutionStartedAt, mailboxConfig: { equals: timer.mailboxConfig as Prisma.InputJsonValue } },
    data: { resolutionStartedAt: work.startedAt, mailboxConfig: updatedSnapshot as unknown as Prisma.InputJsonValue },
  });
  if (claimed.count) {
    timer.mailboxConfig = updatedSnapshot;
    timer.resolutionStartedAt = work.startedAt;
  } else {
    const current = await prisma.slaTimer.findUnique({ where: { ticketId: timer.ticketId }, select: { mailboxConfig: true, resolutionStartedAt: true } });
    if (current) {
      timer.mailboxConfig = current.mailboxConfig;
      timer.resolutionStartedAt = current.resolutionStartedAt;
    }
  }
}

function isResolutionPending(timer: { source?: string | null; mailboxConfig?: unknown }): boolean {
  return (timer.source === MAILBOX_SLA_SOURCE && readMailboxSnapshot(timer.mailboxConfig)?.resolutionActivatedAt === null)
    || (timer.source === FORM_SLA_SOURCE && readFormSlaSnapshot(timer.mailboxConfig)?.resolutionActivatedAt == null);
}

export async function startMailboxResolutionOnWork(ticketId: string, at: Date = new Date()): Promise<void> {
  const timer = await prisma.slaTimer.findUnique({ where: { ticketId }, include: { ticket: { select: SLA_TICKET_SELECT } } });
  if (timer) {
    await reconcileMailboxResolutionStart(timer, at);
    await reconcileFormResolutionStart(timer, at);
  }
}

async function runtimeForTimer(timer: {
  source: string | null; mailboxConfig?: unknown;
  ticket: { assigneeId: string | null; subDepartmentId: string; subDepartment: { departmentId: string } };
}, from: Date, until: Date) {
  const snapshot = timer.source === MAILBOX_SLA_SOURCE ? readMailboxSnapshot(timer.mailboxConfig) : readFormSlaSnapshot(timer.mailboxConfig);
  const departmentId = timer.ticket.subDepartment.departmentId;
  const subDepartmentId = timer.ticket.subDepartmentId;
  if (snapshot) return {
    calendar: snapshot.calendar,
    slaConfig: { pauseOutsideHours: true, pauseWhenWaitingForCustomer: true, atRiskPct: snapshot.atRiskPct, mailboxActiveStatuses: snapshot.activeStatuses, firstResponseActiveStatuses: snapshot.activeStatuses },
  };
  const { slaConfig } = await resolveSlaSettings(departmentId, subDepartmentId);
  return {
    calendar: await resolveCalendarForTicket({ departmentId, subDepartmentId, assigneeId: timer.ticket.assigneeId, forceWorkingHours: timer.source === MAILBOX_SLA_SOURCE || timer.source === FORM_SLA_SOURCE }, from, until),
    slaConfig: timer.source === MAILBOX_SLA_SOURCE || timer.source === FORM_SLA_SOURCE ? { ...slaConfig, pauseWhenWaitingForCustomer: true } : slaConfig,
  };
}

/** Stops mailbox/form response on a configured active workflow status. Historical export retained for workflow callers. */
export async function stopMailboxFirstResponseOnActiveStatus(ticketId: string, status: string, at: Date = new Date()) {
  const timer = await prisma.slaTimer.findUnique({ where: { ticketId }, include: { ticket: { select: SLA_TICKET_SELECT } } });
  if (!timer || !isSlaEligible(timer) || timer.firstResponseStoppedAt) return;
  const snapshot = timer.source === MAILBOX_SLA_SOURCE ? readMailboxSnapshot(timer.mailboxConfig) : readFormSlaSnapshot(timer.mailboxConfig);
  const settings = snapshot ? null : (await resolveSlaSettings(timer.ticket.subDepartment.departmentId, timer.ticket.subDepartmentId)).slaConfig;
  const statuses = snapshot?.activeStatuses ?? (timer.source === MAILBOX_SLA_SOURCE ? settings!.mailboxActiveStatuses : settings!.firstResponseActiveStatuses);
  if (isMailboxActiveStatus(status, statuses)) {
    await reconcileFirstResponseActiveStatus(timer, at);
    if (!timer.firstResponseStoppedAt) await stopFirstResponseOnPublicAgentMessage(ticketId, at);
    await checkAndNotifySla(ticketId, at);
  }
}

async function loadResolutionPauseIntervals(
  ticketId: string,
  until: Date,
  pauseWhenWaitingForCustomer: boolean,
  mailbox = false,
  form = false,
  cycleStart?: Date,
): Promise<SlaPauseInterval[]> {
  if (!pauseWhenWaitingForCustomer) return [];
  const [messages, portal] = await Promise.all([
    prisma.ticketMessage.findMany({
      where: { ticketId, status: { not: "system" }, ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}) },
      select: { direction: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    loadPortalConversation(ticketId),
  ]);
  if (mailbox || form) {
    const history = await prisma.activityLog.findMany({
      where: { ticketId, action: "STATUS_CHANGED", createdAt: { lte: until, ...(cycleStart ? { gte: cycleStart } : {}) } },
      select: { createdAt: true, metadata: true }, orderBy: { createdAt: "asc" },
    });
    return mailboxWaitingIntervals([
      ...messages.filter((message) => message.status === "trusted").map((message) => ({ createdAt: message.createdAt, waiting: message.direction === "outbound" })),
      ...portal.filter((message) => !cycleStart || new Date(message.createdAt) >= cycleStart).map((message) => ({ createdAt: new Date(message.createdAt), waiting: message.direction === "outbound" })),
      ...history.flatMap((event) => {
        const status = statusDestination(event.metadata);
        const from = (event.metadata as Record<string, unknown> | null)?.from;
        // Generic status updates (including automatic In Progress after an
        // outbound reply) do not cancel a conversation-derived customer wait.
        const touchesWait = status && (isWaitingForCustomer(status) || (typeof from === "string" && isWaitingForCustomer(from)));
        return touchesWait ? [{ createdAt: event.createdAt, waiting: isWaitingForCustomer(status!) }] : [];
      }),
    ], until);
  }
  return waitingForCustomerPauseIntervals([...messages, ...portal], until);
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
 * starts fresh SLA/work cycles when the agent enters In Progress.
 */
export async function syncResolutionTimerOnClosedAtChange(ticketId: string, closedAt: Date | null): Promise<void> {
  try {
    if (closedAt !== null) {
      await finalizeManualResolution(ticketId);
      await stopTicketWorkAt(ticketId, closedAt);
    }
    const timer = await prisma.slaTimer.findUnique({ where: { ticketId } });
    if (!timer && closedAt !== null) return;

    if (closedAt !== null && timer) {
      if (timer.resolutionStoppedAt !== null) return; // already stopped
      if (timer.source === MAILBOX_SLA_SOURCE || timer.source === FORM_SLA_SOURCE) {
        await checkAndNotifySla(ticketId, closedAt, { finalizing: true });
        await prisma.slaTimer.updateMany({
          where: { ticketId, firstResponseStoppedAt: null }, data: { firstResponseStoppedAt: closedAt },
        });
      }
      await prisma.slaTimer.update({ where: { ticketId }, data: { resolutionStoppedAt: closedAt } });
      if (timer.source === MAILBOX_SLA_SOURCE) {
        const final = await getSlaIndicatorForTicket(ticketId, closedAt);
        if (final) await prisma.ticket.updateMany({
          where: { id: ticketId, closedAt },
          data: { resolutionDurationMins: Math.round(final.resolution.elapsedMs / 60_000), resolvedWithinAllowed: final.resolution.elapsedMs <= final.resolution.targetMs },
        });
      }
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, closedAt: true, deletedAt: true, creatorId: true, assigneeId: true, resolutionDurationMins: true },
    });
    if (!ticket || ticket.closedAt || ticket.deletedAt || normalizeStatus(ticket.status) !== "In Progress") return;
    // A normal open-status transition cannot reset a live cycle. Manual tickets
    // have no SlaTimer; their persisted completion total supplies the guard.
    if (timer ? timer.resolutionStoppedAt === null : ticket.resolutionDurationMins == null) return;
    const now = new Date();
    const actorId = ticket.assigneeId ?? ticket.creatorId;
    const snapshot = timer?.source === MAILBOX_SLA_SOURCE ? readMailboxSnapshot(timer.mailboxConfig)
      : timer?.source === FORM_SLA_SOURCE ? readFormSlaSnapshot(timer.mailboxConfig) : null;
    const claimed = await prisma.$transaction(async (tx) => {
      if (timer) {
        const changed = await tx.slaTimer.updateMany({
          where: { ticketId, resolutionStoppedAt: timer.resolutionStoppedAt },
          data: {
            ...planReopen(now),
            // In Progress is itself the agent's first response where configured.
            ...(snapshot && isMailboxActiveStatus(ticket.status, snapshot.activeStatuses) ? { firstResponseStoppedAt: now } : {}),
            ...(snapshot ? { mailboxConfig: { ...snapshot, resolutionActivatedAt: timer?.source === MAILBOX_SLA_SOURCE && isMailboxActiveStatus(ticket.status, snapshot.activeStatuses) ? now.toISOString() : null } as unknown as Prisma.InputJsonValue } : {}),
          },
        });
        if (!changed.count) return false;
      }
      const changed = await tx.ticket.updateMany({
        where: { id: ticketId, closedAt: null, status: ticket.status,
          ...(!timer ? { resolutionDurationMins: ticket.resolutionDurationMins } : {}) },
        data: { inProgressStartedAt: now, resolutionDurationMins: null, resolvedWithinAllowed: null, estimateOverrunNotifiedAt: null },
      });
      if (!changed.count) throw new Error("Ticket changed during reopen");
      await tx.activityLog.create({ data: {
        ticketId, actorId, action: "TIMER_RESET", createdAt: now,
        metadata: { reopenCycle: true, clearedSecs: 0, entryCount: 0 },
      } });
      return true;
    });
    if (claimed) await broadcastTicketEvent(ticketId, "TIMER_RESET", actorId, { reopenCycle: true, clearedSecs: 0, entryCount: 0 });
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

/** New mailbox/form resolution clocks breach only after allowed time is exceeded. */
function evaluateForTimer(timer: Parameters<typeof toTimerState>[0] & { source?: string | null; mailboxConfig?: unknown }, now: Date, calendar: WorkingHoursCalendar | null, atRiskPct: number, pauses: SlaPauseInterval[]) {
  const pending = isResolutionPending(timer);
  const state = pending ? { ...toTimerState(timer), resolutionStartedAt: now, resolutionStoppedAt: now } : toTimerState(timer);
  const result = evaluateSlaIndicator(state, now, calendar, atRiskPct, pauses);
  if ((timer.source === MAILBOX_SLA_SOURCE || timer.source === FORM_SLA_SOURCE) && result.resolution.elapsedMs === result.resolution.targetMs) {
    result.resolution.status = "AT_RISK";
    result.overall = result.firstResponse.status === "BREACHED" ? "BREACHED" : "AT_RISK";
  }
  return result;
}

// SLA-eligible timers: form-submitted tickets, plus timers started from the
// department's shared-mailbox SLA. Older timers on manual and mailbox tickets
// (pre-mailbox-SLA, no `source`) are retained as history but ignored for
// indicators/alerts.
const SLA_TICKET_SELECT = {
  id: true,
  assigneeId: true,
  closedAt: true,
  deletedAt: true,
  isDraft: true,
  status: true,
  subDepartmentId: true,
  subDepartment: { select: { departmentId: true } },
  intake: { select: { id: true } },
} as const satisfies Prisma.TicketSelect;

function isSlaEligible(timer: {
  source: string | null;
  ticket: { intake: { id: string } | null };
}): boolean {
  return timer.ticket.intake !== null || timer.source === MAILBOX_SLA_SOURCE;
}

/** Read-only SLA indicator for a ticket (SLA-06), for the API/UI. Null when no SLA applies. */
export async function getSlaIndicatorForTicket(ticketId: string, now: Date = new Date()): Promise<SlaIndicator | null> {
  const timer = await prisma.slaTimer.findUnique({
    where: { ticketId },
    include: { ticket: { select: SLA_TICKET_SELECT } },
  });
  if (!timer || !isSlaEligible(timer)) return null;

  await reconcileFirstResponseActiveStatus(timer, now);
  await reconcileMailboxResolutionStart(timer, now);
  await reconcileFormResolutionStart(timer, timer.resolutionStoppedAt ?? now);
  const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
  const { calendar, slaConfig } = await runtimeForTimer(timer, rangeFrom, now);
  const resolutionUntil = timer.resolutionStoppedAt ?? now;
  const resolutionPauses = await loadResolutionPauseIntervals(
    ticketId,
    resolutionUntil,
    slaConfig.pauseWhenWaitingForCustomer,
    timer.source === MAILBOX_SLA_SOURCE,
    timer.source === FORM_SLA_SOURCE,
    timer.firstResponseStartedAt,
  );

  return evaluateForTimer(timer, now, calendar, slaConfig.atRiskPct, resolutionPauses);
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
  opts: { includeDetails?: boolean } = {},
): Promise<SlaIndicatorView | null> {
  const timer = await prisma.slaTimer.findUnique({
    where: { ticketId },
    include: {
      ticket: { select: SLA_TICKET_SELECT },
      policy: { select: { name: true } },
    },
  });
  if (!timer || !isSlaEligible(timer)) return null;

  await reconcileFirstResponseActiveStatus(timer, now);
  await reconcileMailboxResolutionStart(timer, now);
  await reconcileFormResolutionStart(timer, timer.resolutionStoppedAt ?? now);
  const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
  const probeEnd = new Date(now.getTime() + RUNNING_PROBE_MS);
  const { calendar, slaConfig } = await runtimeForTimer(timer, rangeFrom, probeEnd);
  // Extend the pause window to the probe end so an open (still-ongoing)
  // waiting-for-customer pause covers the probe interval, keeping a paused
  // resolution metric from looking "running". Clamping in elapsedCountableMs
  // means this extension never affects the elapsed measured at `now` itself.
  const resolutionUntil = timer.resolutionStoppedAt ?? probeEnd;
  const resolutionPauses = await loadResolutionPauseIntervals(
    ticketId,
    resolutionUntil,
    slaConfig.pauseWhenWaitingForCustomer,
    timer.source === MAILBOX_SLA_SOURCE,
    timer.source === FORM_SLA_SOURCE,
    timer.firstResponseStartedAt,
  );

  const atNow = evaluateForTimer(timer, now, calendar, slaConfig.atRiskPct, resolutionPauses);
  const atProbe = evaluateForTimer(timer, probeEnd, calendar, slaConfig.atRiskPct, resolutionPauses);

  const view: SlaIndicatorView = {
    firstResponse: { ...atNow.firstResponse, running: atProbe.firstResponse.remainingMs < atNow.firstResponse.remainingMs },
    resolution: { ...atNow.resolution, running: atProbe.resolution.remainingMs < atNow.resolution.remainingMs },
    overall: atNow.overall,
    asOf: now.toISOString(),
    ...([MAILBOX_SLA_SOURCE, FORM_SLA_SOURCE].includes(timer.source ?? "") ? { source: timer.source!, completed: timer.resolutionStoppedAt !== null } : {}),
  };
  if (!opts.includeDetails) return view;

  // Admin/manager detail view: clock instants + the immutable breach history
  // (SLA-07), which survives reopen cycles that reset the live metrics.
  const breaches = await prisma.slaBreach.findMany({
    where: { ticketId },
    orderBy: { breachedAt: "asc" },
    select: { metric: true, targetMins: true, breachedAt: true },
  });
  view.details = {
    policyName: timer.policy?.name ?? (timer.source === MAILBOX_SLA_SOURCE ? "Shared mailbox SLA" : null),
    firstResponseStartedAt: timer.firstResponseStartedAt.toISOString(),
    firstResponseStoppedAt: timer.firstResponseStoppedAt?.toISOString() ?? null,
    resolutionStartedAt: isResolutionPending(timer) ? null : timer.resolutionStartedAt.toISOString(),
    resolutionStoppedAt: timer.resolutionStoppedAt?.toISOString() ?? null,
    breaches: breaches.map((b) => ({
      metric: b.metric === "resolution" ? "resolution" : "first_response",
      targetMins: b.targetMins,
      breachedAt: b.breachedAt.toISOString(),
    })),
  };
  return view;
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
export async function checkAndNotifySla(ticketId: string, now: Date = new Date(), opts: { finalizing?: boolean } = {}): Promise<void> {
  try {
    const timer = await prisma.slaTimer.findUnique({
      where: { ticketId },
      include: {
        ticket: {
          select: SLA_TICKET_SELECT,
        },
      },
    });
    if (!timer || !isSlaEligible(timer)) return;
    if (timer.ticket.deletedAt || timer.ticket.isDraft || (timer.ticket.closedAt && !opts.finalizing)) return;

    await reconcileFirstResponseActiveStatus(timer, now);
    await reconcileMailboxResolutionStart(timer, now, opts.finalizing);
    await reconcileFormResolutionStart(timer, timer.resolutionStoppedAt ?? now);
    const departmentId = timer.ticket.subDepartment.departmentId;
    const rangeFrom = timer.firstResponseStartedAt < timer.resolutionStartedAt ? timer.firstResponseStartedAt : timer.resolutionStartedAt;
    const { calendar, slaConfig } = await runtimeForTimer(timer, rangeFrom, now);
    const atRiskPct = slaConfig.atRiskPct;
    const resolutionUntil = timer.resolutionStoppedAt ?? now;
    const resolutionPauses = await loadResolutionPauseIntervals(
      ticketId,
      resolutionUntil,
      slaConfig.pauseWhenWaitingForCustomer,
      timer.source === MAILBOX_SLA_SOURCE,
      timer.source === FORM_SLA_SOURCE,
      timer.firstResponseStartedAt,
    );

    const indicator = evaluateForTimer(timer, now, calendar, atRiskPct, resolutionPauses);

    const updates: Prisma.SlaTimerUpdateInput = {};
    // Per-metric notification events, so recipients get a message that names
    // the specific SLA (Time to First Response vs Time to Resolution) and level.
    const events: SlaNotifyEvent[] = [];
    // Set when the Time to First Response SLA breaches while no agent has made
    // the required first response — the trigger for automatic escalation below.
    let firstResponseBreachedUnanswered = false;

    if (indicator.firstResponse.status !== "ON_TRACK" && (timer.firstResponseStoppedAt === null || ((timer.source === MAILBOX_SLA_SOURCE || timer.source === FORM_SLA_SOURCE) && indicator.firstResponse.status === "BREACHED"))) {
      if (indicator.firstResponse.status === "BREACHED" && timer.firstResponseBreachNotifiedAt === null) {
        updates.firstResponseBreachNotifiedAt = now;
        events.push({ metric: "first_response", level: "breach" });
        firstResponseBreachedUnanswered = timer.firstResponseStoppedAt === null;
      } else if (indicator.firstResponse.status === "AT_RISK" && timer.firstResponseAtRiskNotifiedAt === null) {
        updates.firstResponseAtRiskNotifiedAt = now;
        events.push({ metric: "first_response", level: "at_risk" });
      }
    }
    if (indicator.resolution.status !== "ON_TRACK" && timer.resolutionStoppedAt === null) {
      if (indicator.resolution.status === "BREACHED" && timer.resolutionBreachNotifiedAt === null) {
        updates.resolutionBreachNotifiedAt = now;
        events.push({ metric: "resolution", level: "breach" });
      } else if (indicator.resolution.status === "AT_RISK" && timer.resolutionAtRiskNotifiedAt === null) {
        updates.resolutionAtRiskNotifiedAt = now;
        events.push({ metric: "resolution", level: "at_risk" });
      }
    }

    if (Object.keys(updates).length === 0) return;

    const claimed = await prisma.$transaction(async (tx) => {
      const won: SlaNotifyEvent[] = [];
      for (const event of events) {
        const field = event.metric === "first_response"
          ? event.level === "breach" ? "firstResponseBreachNotifiedAt" : "firstResponseAtRiskNotifiedAt"
          : event.level === "breach" ? "resolutionBreachNotifiedAt" : "resolutionAtRiskNotifiedAt";
        const stoppedField = event.metric === "first_response" ? "firstResponseStoppedAt" : "resolutionStoppedAt";
        const claim = await tx.slaTimer.updateMany({ where: { ticketId, firstResponseStartedAt: timer.firstResponseStartedAt, resolutionStartedAt: timer.resolutionStartedAt, [field]: null, [stoppedField]: event.metric === "first_response" ? timer.firstResponseStoppedAt : timer.resolutionStoppedAt }, data: { [field]: now } });
        if (!claim.count) continue;
        if (event.level === "breach") await tx.slaBreach.create({ data: {
          ticketId, tenantId: timer.tenantId, timerId: timer.id, metric: event.metric,
          targetMins: event.metric === "first_response" ? timer.firstResponseTargetMins : timer.resolutionTargetMins,
          breachedAt: now,
        } });
        won.push(event);
      }
      return won;
    });
    if (!claimed.length) return;

    await notifyRecipients(ticketId, departmentId, timer.ticket.assigneeId, claimed, timer.tenantId);

    // Auto-escalate on a Time to First Response breach that went unanswered.
    // Best-effort and idempotent: gated by the just-set `firstResponseBreachNotifiedAt`
    // flag so it runs once, and `escalateTicket` no-ops if already escalated.
    // Imported dynamically to avoid a static import cycle (ticket-escalation
    // imports `syncResolutionTimerOnClosedAtChange` from this module). Runs in a
    // system/automation context — no `actorId`/`timerActor`; `activitySource`
    // marks the ActivityLog status change as SLA-driven automation.
    if (firstResponseBreachedUnanswered && !opts.finalizing && claimed.some((event) => event.metric === "first_response" && event.level === "breach")) {
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
  tenantId: string,
): Promise<void> {
  if (events.length === 0) return;

  const recipientIds = new Set<string>();
  if (assigneeId) recipientIds.add(assigneeId);
  const managers = await prisma.departmentManager.findMany({
    where: { departmentId },
    select: { userId: true },
  });
  for (const m of managers) recipientIds.add(m.userId);
  const tenantManagers = await prisma.tenantMembership.findMany({
    where: { tenantId, role: "manager", isActive: true }, select: { userId: true },
  });
  for (const manager of tenantManagers) recipientIds.add(manager.userId);

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
    where: { ticket: { deletedAt: null, closedAt: null, isDraft: false }, OR: [{ firstResponseStoppedAt: null }, { resolutionStoppedAt: null }] },
    select: { ticketId: true },
    orderBy: { resolutionStartedAt: "asc" }, // oldest (closest to breach) first
  });

  const manualTickets = await prisma.ticket.findMany({
    where: {
      ...manualTicketWhere, deletedAt: null, isDraft: false, closedAt: null,
      estimatedTime: { gt: 0 }, estimateOverrunNotifiedAt: null,
      timeEntries: { some: {} },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const checks = [
    ...manualTickets.map(({ id }) => () => checkAndNotifyEstimateOverrun(id, now)),
    ...timers.map(({ ticketId }) => () => checkAndNotifySla(ticketId, now)),
  ];
  let checked = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < checks.length && Date.now() < deadline) {
      await checks[cursor++]!();
      checked++;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SWEEP_CONCURRENCY, checks.length) }, worker),
  );
  return checked;
}

export type { SlaIndicator } from "@/lib/sla-timer";
export type { SlaPolicyLike, SlaTargets } from "@/lib/sla-policy-match";
export type { ConditionGroup as SlaConditionGroup };
