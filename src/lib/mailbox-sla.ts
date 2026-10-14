import type { WorkingHoursCalendar, SlaPauseInterval } from "./sla-calendar"

export type MailboxSlaSnapshot = {
  calendar: WorkingHoursCalendar
  /** Null until agent work begins; absent on older snapshots. */
  resolutionActivatedAt?: string | null
  atRiskPct: number
  activeStatuses: string[]
  targetSource: "mailbox" | "department" | "tenant"
}
export function readMailboxSnapshot(value: unknown): MailboxSlaSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const snapshot = value as MailboxSlaSnapshot
  return snapshot.calendar && Array.isArray(snapshot.activeStatuses) && typeof snapshot.atRiskPct === "number" ? snapshot : null
}
export function isMailboxActiveStatus(status: string, activeStatuses: readonly string[]): boolean {
  return activeStatuses.some((active) => active.toLowerCase().replace(/[\s_-]/g, "") === status.toLowerCase().replace(/[\s_-]/g, ""))
}
export type MailboxStatusEvent = { createdAt: Date; metadata: unknown }

/** Waiting workflow statuses and public conversation changes share one timeline.
 * Internal/system/quarantined messages are filtered by the caller. */
export function mailboxWaitingIntervals(
  changes: readonly { createdAt: Date; waiting: boolean }[], until: Date,
): SlaPauseInterval[] {
  let started: Date | null = null
  const intervals: SlaPauseInterval[] = []
  for (const change of [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (change.createdAt > until) break
    if (change.waiting && !started) started = change.createdAt
    if (!change.waiting && started) {
      if (change.createdAt > started) intervals.push({ from: started, to: change.createdAt })
      started = null
    }
  }
  if (started && started < until) intervals.push({ from: started, to: until })
  return intervals
}
export function statusDestination(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const to = (metadata as Record<string, unknown>).to
  return typeof to === "string" ? to : null
}
export function isWaitingForCustomer(status: string): boolean {
  return status.toLowerCase().replace(/[\s_-]/g, "") === "waitingforcustomer"
}
