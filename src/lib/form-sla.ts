import type { WorkingHoursCalendar } from "./sla-calendar"

export const FORM_SLA_SOURCE = "form"
export type FormSlaSnapshot = {
  /** Null until the first persisted work-tracking session; absent on earlier Stage 3 snapshots. */
  resolutionActivatedAt?: string | null
  calendar: WorkingHoursCalendar
  atRiskPct: number
  activeStatuses: string[]
}

export function readFormSlaSnapshot(value: unknown): FormSlaSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const snapshot = value as FormSlaSnapshot
  return snapshot.calendar && Array.isArray(snapshot.activeStatuses) && typeof snapshot.atRiskPct === "number"
    ? snapshot : null
}
