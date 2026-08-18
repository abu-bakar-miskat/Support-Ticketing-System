/**
 * Working-hours calendar math for SLA timers (slice 10, SLA-04/WH-05). PURE —
 * no DB, no wall-clock reads; every function takes its instants as arguments
 * so tests can inject a fixed clock.
 *
 * Same lightweight timezone approach as availability.ts: `Intl.DateTimeFormat`
 * with an explicit `timeZone` gives us date keys and offsets without pulling
 * in a timezone library.
 */

export type WorkingHoursCalendar = {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  /** "HH:MM" 24h wall-clock time, local to `timezone`. */
  workStartTime: string;
  /** "HH:MM" 24h wall-clock time, local to `timezone`. */
  workEndTime: string;
  /** Inclusive whole-day exclusion ranges, as "YYYY-MM-DD" date keys local to `timezone`. */
  holidays: { start: string; end: string }[];
};

function toDateKeyInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
}

function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(dateKey + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): number {
  return new Date(dateKey + "T12:00:00.000Z").getUTCDay();
}

function isHoliday(dateKey: string, holidays: WorkingHoursCalendar["holidays"]): boolean {
  return holidays.some((h) => dateKey >= h.start && dateKey <= h.end);
}

/** `timeZone`'s offset from UTC (ms, positive east of UTC) at instant `t`. */
function tzOffsetMs(t: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(t);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtcFields = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtcFields - t.getTime();
}

/**
 * Convert a wall-clock "HH:MM" on a given calendar date, local to `timeZone`,
 * into the corresponding instant (UTC `Date`). Uses the offset at the naive
 * UTC guess as a stand-in for the offset at the true instant — exact except
 * within a DST transition window, which is an acceptable approximation for
 * SLA accounting.
 */
function zonedWallTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateKey}T${time}:00.000Z`);
  const offsetMs = tzOffsetMs(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offsetMs);
}

/**
 * Total working (business) milliseconds between two instants. When
 * `calendar` is null, timers never pause — this simply returns `to - from`
 * (clamped to 0). Otherwise walks day-by-day in the calendar's timezone,
 * summing the overlap of each working day's business window (minus holidays)
 * with `[from, to]`.
 */
export function elapsedWorkingMs(from: Date, to: Date, calendar: WorkingHoursCalendar | null): number {
  if (to.getTime() <= from.getTime()) return 0;
  if (calendar === null) return to.getTime() - from.getTime();

  const { timezone, workingDays, workStartTime, workEndTime, holidays } = calendar;
  const endKey = toDateKeyInTz(to, timezone);
  let dateKey = toDateKeyInTz(from, timezone);
  let total = 0;

  while (dateKey <= endKey) {
    if (workingDays.includes(weekdayOf(dateKey)) && !isHoliday(dateKey, holidays)) {
      const windowStart = zonedWallTimeToUtc(dateKey, workStartTime, timezone);
      const windowEnd = zonedWallTimeToUtc(dateKey, workEndTime, timezone);
      const overlapStart = Math.max(windowStart.getTime(), from.getTime());
      const overlapEnd = Math.min(windowEnd.getTime(), to.getTime());
      if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    }
    dateKey = addDaysKey(dateKey, 1);
  }

  return total;
}
