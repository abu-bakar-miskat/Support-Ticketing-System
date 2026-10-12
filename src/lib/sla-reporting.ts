import { elapsedCountableMs, elapsedWorkingMs, type SlaPauseInterval, type WorkingHoursCalendar } from "./sla-calendar"
import type { SlaMetricResult } from "./sla-timer"

export type SlaMetricReport = {
  allowedMs: number
  actualMs: number
  overtimeMs: number
  /** null until completion; uses the metric's authoritative boundary semantics. */
  compliant: boolean | null
}

export function metricReport(metric: SlaMetricResult, completed: boolean): SlaMetricReport {
  return {
    allowedMs: metric.targetMs, actualMs: metric.elapsedMs,
    overtimeMs: Math.max(0, metric.elapsedMs - metric.targetMs),
    compliant: completed ? metric.status !== "BREACHED" : null,
  }
}

/** Union of customer waits, clipped to this cycle; never double-count repeated replies. */
export function customerWaitingMs(from: Date, until: Date, pauses: readonly SlaPauseInterval[], calendar: WorkingHoursCalendar | null = null): number {
  return elapsedWorkingMs(from, until, calendar) - elapsedCountableMs(from, until, calendar, pauses)
}
