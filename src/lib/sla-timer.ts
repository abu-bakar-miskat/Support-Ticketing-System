/**
 * SLA timer state machine (slice 10, SLA-03/05/06, OQ-03). PURE — no DB, no
 * wall-clock reads. Timer state is just start/stop instants; elapsed working
 * time is computed lazily from `(startedAt, stoppedAt ?? now, calendar)` via
 * sla-calendar.ts, so there is no accumulated-pause counter to keep in sync
 * and every function here is trivially testable with an injected clock.
 */
import { elapsedWorkingMs, type WorkingHoursCalendar } from "./sla-calendar";

export type SlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED";

export const DEFAULT_AT_RISK_PCT = 80;

export type SlaMetricState = {
  startedAt: Date;
  /** Set once the metric is done being tracked (e.g. first PUBLIC agent reply, or ticket closed). */
  stoppedAt: Date | null;
};

export type SlaMetricResult = {
  status: SlaStatus;
  elapsedMs: number;
  targetMs: number;
  /** Negative once breached (i.e. overdue by `-remainingMs`). */
  remainingMs: number;
};

/** Evaluate a single first-response/resolution metric (SLA-05/06). */
export function evaluateSlaMetric(
  state: SlaMetricState,
  now: Date,
  targetMins: number,
  calendar: WorkingHoursCalendar | null,
  atRiskPct: number = DEFAULT_AT_RISK_PCT,
): SlaMetricResult {
  const endpoint = state.stoppedAt ?? now;
  const elapsedMs = elapsedWorkingMs(state.startedAt, endpoint, calendar);
  const targetMs = targetMins * 60_000;
  const remainingMs = targetMs - elapsedMs;
  const ratioPct = targetMs > 0 ? (elapsedMs / targetMs) * 100 : elapsedMs > 0 ? Infinity : 0;

  const status: SlaStatus =
    elapsedMs >= targetMs ? "BREACHED" : ratioPct >= atRiskPct ? "AT_RISK" : "ON_TRACK";

  return { status, elapsedMs, targetMs, remainingMs };
}

export type SlaTimerState = {
  firstResponseTargetMins: number;
  resolutionTargetMins: number;
  firstResponseStartedAt: Date;
  firstResponseStoppedAt: Date | null;
  resolutionStartedAt: Date;
  resolutionStoppedAt: Date | null;
};

export type SlaIndicator = {
  firstResponse: SlaMetricResult;
  resolution: SlaMetricResult;
  /** The worse of the two metric statuses (BREACHED > AT_RISK > ON_TRACK). */
  overall: SlaStatus;
};

const SEVERITY: Record<SlaStatus, number> = { ON_TRACK: 0, AT_RISK: 1, BREACHED: 2 };

/** Evaluate both metrics for a ticket's SLA indicator badge (SLA-06). */
export function evaluateSlaIndicator(
  timer: SlaTimerState,
  now: Date,
  calendar: WorkingHoursCalendar | null,
  atRiskPct: number = DEFAULT_AT_RISK_PCT,
): SlaIndicator {
  const firstResponse = evaluateSlaMetric(
    { startedAt: timer.firstResponseStartedAt, stoppedAt: timer.firstResponseStoppedAt },
    now,
    timer.firstResponseTargetMins,
    calendar,
    atRiskPct,
  );
  const resolution = evaluateSlaMetric(
    { startedAt: timer.resolutionStartedAt, stoppedAt: timer.resolutionStoppedAt },
    now,
    timer.resolutionTargetMins,
    calendar,
    atRiskPct,
  );
  const overall = SEVERITY[firstResponse.status] >= SEVERITY[resolution.status] ? firstResponse.status : resolution.status;
  return { firstResponse, resolution, overall };
}

export type SlaReopenFields = {
  firstResponseStartedAt: Date;
  firstResponseStoppedAt: null;
  firstResponseAtRiskNotifiedAt: null;
  firstResponseBreachNotifiedAt: null;
  resolutionStartedAt: Date;
  resolutionStoppedAt: null;
};

/**
 * OQ-03: on reopen, the resolution timer resumes and a fresh first-response
 * timer starts. "Resume" must not count the time the ticket sat closed as
 * elapsed, but the timer only stores instants (no accumulated-pause
 * counter) — so resuming shifts `resolutionStartedAt` forward by exactly the
 * closed-wall-clock duration (`now - resolutionStoppedAt`). That keeps prior
 * progress intact and is exact for continuous (non-paused) timers; under a
 * working-hours calendar it's a reasonable approximation (business-day math
 * isn't perfectly translation-invariant across the shift), which is
 * acceptable for closed-to-reopen spans of typical support-ticket length.
 * First-response is a genuinely fresh cycle: new `startedAt`, cleared
 * `stoppedAt`, and its notification flags reset so at-risk/breach can fire
 * again. Pure field diff — the caller spreads this into the existing
 * `SlaTimer` row; no new row, no schema change.
 */
export function planReopen(
  timer: Pick<SlaTimerState, "resolutionStartedAt" | "resolutionStoppedAt">,
  now: Date,
): SlaReopenFields {
  const pausedMs = timer.resolutionStoppedAt
    ? Math.max(0, now.getTime() - timer.resolutionStoppedAt.getTime())
    : 0;
  return {
    firstResponseStartedAt: now,
    firstResponseStoppedAt: null,
    firstResponseAtRiskNotifiedAt: null,
    firstResponseBreachNotifiedAt: null,
    resolutionStartedAt: new Date(timer.resolutionStartedAt.getTime() + pausedMs),
    resolutionStoppedAt: null,
  };
}
