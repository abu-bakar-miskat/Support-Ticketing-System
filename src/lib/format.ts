export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Calendar days from today to due date (negative = overdue). */
export function dueDayDiff(dueDate: Date, now: Date = new Date()): number {
  return Math.round(
    (startOfLocalDay(dueDate).getTime() - startOfLocalDay(now).getTime()) /
      86_400_000,
  )
}

/** True only when the due date is before today (not including today). */
export function isDueOverdue(
  dueDate: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false
  return dueDayDiff(dueDate, now) < 0
}

/**
 * Canonical "blocked" check. Matches the "Blocked" status and its lowercase
 * alias. Blocked tickets are never counted as overdue — work is paused, not
 * late — so this is used everywhere overdue is computed.
 */
export function isBlockedStatus(status: string | null | undefined): boolean {
  return !!status && status.trim().toLowerCase() === "blocked"
}

export type TicketDueDisplay = {
  due: string | null
  dueUrgent: boolean
  dueOverdue: boolean
}

export function formatTicketDue(
  dueDate: Date | null,
  now: Date = new Date(),
  opts: { isStatusComplete?: boolean; isBlocked?: boolean } = {},
): TicketDueDisplay {
  // Completed tickets are never overdue regardless of due date.
  if (opts.isStatusComplete) return { due: "Complete", dueUrgent: false, dueOverdue: false }

  // No due date → nothing is due, so it can never be overdue.
  if (!dueDate) return { due: null, dueUrgent: false, dueOverdue: false }

  // Deadline is 23:59:59 of the due date's calendar day.
  const deadline = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
    23, 59, 59, 999,
  )

  // Blocked tickets show their due date but are never flagged overdue —
  // work is paused, not late.
  if (now > deadline && !opts.isBlocked) {
    return { due: "Overdue", dueUrgent: true, dueOverdue: true }
  }

  const dayDiff = dueDayDiff(dueDate, now)
  if (dayDiff === 0) {
    return { due: "Today", dueUrgent: true, dueOverdue: false }
  }
  if (dayDiff === 1) {
    return { due: "Tmrw", dueUrgent: false, dueOverdue: false }
  }
  return {
    due: dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    dueUrgent: false,
    dueOverdue: false,
  }
}

export function timeAgo(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function isToday(date: Date, now: Date = new Date()): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

const APP_TIMEZONE = "Europe/London"

/** "12 Jul 2026, 14:05" style absolute date + time, for "created at" style displays. */
export function formatDateTime(date: Date): string {
  const datePart = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  })
  const timePart = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  })
  return `${datePart}, ${timePart}`
}

/** Compact single-line date + time for dense list tables. */
export function formatListDateTime(date: Date): string {
  const datePart = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  })
  const timePart = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  })
  return `${datePart}, ${timePart}`
}

/** Activity feed date range — fixed TZ so SSR and hydration agree. */
export function formatActivityRangeLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }
  const fLabel = from.toLocaleDateString("en-GB", opts)
  const tLabel = to.toLocaleDateString("en-GB", opts)
  return fLabel === tLabel ? fLabel : `${fLabel} — ${tLabel}`
}

/** "1h 24m" style duration from seconds. */
export function formatDuration(totalSecs: number): string {
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  if (hours === 0) return `${mins}m`
  return `${hours}h ${String(mins).padStart(2, "0")}m`
}
