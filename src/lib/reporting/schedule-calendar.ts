import type { ScheduleFrequency, ScheduleSettings } from "./schedule-settings"

const DAY = 86400000
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date)
  const get = (key: string) => Number(parts.find((part) => part.type === key)!.value)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") }
}
function wallTime(date: Date, timezone: string) {
  const p = localParts(date, timezone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}
/** Resolve local wall time; ambiguous times use the first occurrence, gaps move forward. */
export function localDateTime(day: Date, time: string, timezone: string): Date {
  const [hour, minute] = time.split(":").map(Number)
  const desired = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute)
  let candidate = desired
  const seen = new Set<number>()
  for (let i = 0; i < 8; i++) {
    const delta = desired - wallTime(new Date(candidate), timezone)
    if (!delta) {
      for (let mins = 120; mins > 0; mins -= 15) {
        const earlier = candidate - mins * 60000
        if (wallTime(new Date(earlier), timezone) === desired) return new Date(earlier)
      }
      return new Date(candidate)
    }
    seen.add(candidate)
    const next = candidate + delta
    if (seen.has(next)) return new Date(Math.max(candidate, next))
    candidate = next
  }
  throw new Error("Could not resolve the scheduled local time")
}
function localDay(date: Date, timezone: string) {
  const p = localParts(date, timezone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}
function monthDay(year: number, month: number, day: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, last)))
}
export function nextScheduledRun(frequency: ScheduleFrequency, settings: ScheduleSettings, after: Date): Date {
  let day = localDay(after, settings.timezone)
  if (frequency === "WEEKLY") day = new Date(day.getTime() + ((settings.weekday - day.getUTCDay() + 7) % 7) * DAY)
  if (frequency === "MONTHLY") day = monthDay(day.getUTCFullYear(), day.getUTCMonth(), settings.monthDay)
  let next = localDateTime(day, settings.runTime, settings.timezone)
  if (next <= after) {
    day = frequency === "MONTHLY" ? monthDay(day.getUTCFullYear(), day.getUTCMonth() + 1, settings.monthDay)
      : new Date(day.getTime() + (frequency === "WEEKLY" ? 7 : 1) * DAY)
    next = localDateTime(day, settings.runTime, settings.timezone)
  }
  return next
}
export function scheduledReportRange(settings: ScheduleSettings | null, rangeDays: number, runAt: Date) {
  if (!settings || settings.period === "rolling") return { start: new Date(runAt.getTime() - rangeDays * DAY), end: runAt }
  const day = localDay(runAt, settings.timezone)
  let from: Date, until: Date
  if (settings.period === "previous_day") {
    until = day; from = new Date(day.getTime() - DAY)
  } else if (settings.period === "previous_week") {
    until = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY)
    from = new Date(until.getTime() - 7 * DAY)
  } else {
    until = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
    from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1))
  }
  return { start: localDateTime(from, "00:00", settings.timezone), end: localDateTime(until, "00:00", settings.timezone) }
}
