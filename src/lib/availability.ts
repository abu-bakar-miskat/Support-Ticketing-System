/**
 * Unavailability helpers for display badges.
 *
 * Mirrors the assignment engine's definition of "unavailable now"
 * (lib/rota.ts `isMemberAvailableNow`) so the avatar mark matches who
 * auto-assignment skips: inactive accounts, holidays, non-working days, and
 * time outside working hours. All time reasoning is done in each member's own
 * timezone.
 *
 * The per-team `doNotAssign` override is intentionally NOT reflected here — it
 * is a per-sub-department assignment control, not a person-level "away" state,
 * and this badge map is global (no team context).
 */

import { prisma } from "@/lib/db"

export type UnavailabilityKind = "inactive" | "holiday" | "off_hours"

export type UserUnavailability = {
  from: string
  to: string
  reason: string | null
  /** Human label, e.g. "Away until 28 Jul", "Outside working hours". */
  label: string
  /** Why the member is unavailable, so callers can style/group if needed. */
  kind: UnavailabilityKind
}

function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC"
  const candidates = [tz, tz.replace(/\s*\/\s*/g, "/").replace(/ /g, "_")]
  for (const candidate of candidates) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: candidate })
      return candidate
    } catch {
      // try next
    }
  }
  return "UTC"
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())
}

/** Current day-of-week (0=Sun..6=Sat) and "HH:MM" wall-clock time in a timezone. */
function nowInTz(tz: string): { dayOfWeek: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date())

  const dayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  let hour = parts.find((p) => p.type === "hour")?.value ?? "00"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  // Intl can emit "24" at midnight with hour12:false — normalize to "00".
  if (hour === "24") hour = "00"

  const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    dayOfWeek: DAY_MAP[dayStr] ?? 1,
    time: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  }
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(dateKey: string, delta: number): string {
  const d = new Date(dateKey + "T12:00:00.000Z")
  d.setUTCDate(d.getUTCDate() + delta)
  return toDateKey(d)
}

function formatDay(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00.000Z")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function buildHolidayLabel(from: string, to: string): string {
  if (from === to) return `Away ${formatDay(from)}`
  const todayUtc = toDateKey(new Date())
  if (from <= todayUtc && to >= todayUtc) {
    return `Away until ${formatDay(to)}`
  }
  return `Away ${formatDay(from)}–${formatDay(to)}`
}

function contiguousRangeContaining(
  dateKeys: string[],
  today: string,
): { from: string; to: string } | null {
  const set = new Set(dateKeys)
  if (!set.has(today)) return null
  let from = today
  let to = today
  while (set.has(addDays(from, -1))) from = addDays(from, -1)
  while (set.has(addDays(to, 1))) to = addDays(to, 1)
  return { from, to }
}

type ScheduleRow = {
  userId: string
  workingDays: number[]
  workStartTime: string
  workEndTime: string
}

/**
 * Returns everyone who is unavailable *right now* (in their own timezone),
 * keyed by userId. Covers inactive accounts, holidays, non-working days, and
 * off-hours — the same conditions the assignment engine uses.
 *
 * Pass `userIds` to restrict to specific members (and widen the holiday window
 * so tooltips can show the full contiguous block). Omit it for the global map
 * the avatar badges consume.
 */
export async function getUnavailabilityByUserIds(
  userIds?: string[],
): Promise<Record<string, UserUnavailability>> {
  if (userIds && userIds.length === 0) return {}
  const idFilter = userIds && userIds.length > 0 ? { in: userIds } : undefined

  const utcToday = toDateKey(new Date())
  // Avatar "today" badges only need today ±1 day. The wider window is for
  // callers that pass specific user ids (member config) so the contiguous
  // holiday block — and thus the "Away until X" label — is accurate.
  const span = idFilter ? 45 : 1
  const windowStart = new Date(addDays(utcToday, -span) + "T00:00:00.000Z")
  const windowEnd = new Date(addDays(utcToday, span) + "T23:59:59.999Z")

  const [holidays, schedules, inactiveProfiles] = await Promise.all([
    prisma.memberHoliday.findMany({
      where: { date: { gte: windowStart, lte: windowEnd }, ...(idFilter ? { userId: idFilter } : {}) },
      select: { userId: true, date: true, reason: true },
      orderBy: { date: "asc" },
    }),
    prisma.memberSchedule.findMany({
      where: idFilter ? { userId: idFilter } : {},
      select: { userId: true, workingDays: true, workStartTime: true, workEndTime: true },
    }),
    // Inactive members may have neither a schedule nor a holiday but must still
    // show the mark.
    prisma.profile.findMany({
      where: { isActive: false, deletedAt: null, ...(idFilter ? { id: idFilter } : {}) },
      select: { id: true },
    }),
  ])

  // Group holidays per user.
  const holidayByUser = new Map<string, { dates: string[]; reasons: Map<string, string | null> }>()
  for (const h of holidays) {
    const key = toDateKey(h.date)
    let entry = holidayByUser.get(h.userId)
    if (!entry) {
      entry = { dates: [], reasons: new Map() }
      holidayByUser.set(h.userId, entry)
    }
    entry.dates.push(key)
    entry.reasons.set(key, h.reason ?? null)
  }

  const scheduleByUser = new Map<string, ScheduleRow>(schedules.map((s) => [s.userId, s]))

  // Every user that could be unavailable → resolve their timezone + isActive once.
  const candidateIds = new Set<string>([
    ...holidayByUser.keys(),
    ...scheduleByUser.keys(),
    ...inactiveProfiles.map((p) => p.id),
  ])
  if (candidateIds.size === 0) return {}

  const profiles = await prisma.profile.findMany({
    where: { id: { in: [...candidateIds] }, deletedAt: null },
    select: { id: true, timezone: true, isActive: true },
  })

  const result: Record<string, UserUnavailability> = {}
  for (const p of profiles) {
    const tz = safeTimezone(p.timezone)
    const todayKey = todayInTz(tz)

    // 1. Inactive account — unavailable everywhere, regardless of schedule.
    if (!p.isActive) {
      result[p.id] = { from: todayKey, to: todayKey, reason: null, label: "Unavailable", kind: "inactive" }
      continue
    }

    // 2. On holiday today (in the member's timezone).
    const holiday = holidayByUser.get(p.id)
    if (holiday) {
      const range = contiguousRangeContaining(holiday.dates, todayKey)
      if (range) {
        result[p.id] = {
          from: range.from,
          to: range.to,
          reason: holiday.reasons.get(todayKey) ?? holiday.reasons.get(range.from) ?? null,
          label: buildHolidayLabel(range.from, range.to),
          kind: "holiday",
        }
        continue
      }
    }

    // 3. Outside the configured working days / hours.
    const schedule = scheduleByUser.get(p.id)
    if (schedule) {
      const { dayOfWeek, time } = nowInTz(tz)
      if (!schedule.workingDays.includes(dayOfWeek)) {
        result[p.id] = { from: todayKey, to: todayKey, reason: null, label: "Off today", kind: "off_hours" }
        continue
      }
      if (time < schedule.workStartTime || time >= schedule.workEndTime) {
        result[p.id] = { from: todayKey, to: todayKey, reason: null, label: "Outside working hours", kind: "off_hours" }
        continue
      }
    }
  }

  return result
}
