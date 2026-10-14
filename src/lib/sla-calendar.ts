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
  const parts = offsetFormatter(timeZone).formatToParts(t);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtcFields = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtcFields - Math.floor(t.getTime() / 1000) * 1000;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = offsetFormatters.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (offsetFormatters.size >= 128) offsetFormatters.delete(offsetFormatters.keys().next().value!);
  offsetFormatters.set(timeZone, formatter);
  return formatter;
}

const DAY_MS = 24 * 60 * 60_000;
const windowCache = new Map<string, { from: number; to: number }[]>();

/** Intersect the local business window with each constant-offset UTC segment.
 * This counts only real instants whose local time is inside the configured
 * window: nonexistent spring times contribute zero; repeated autumn times
 * count their actual occurrences. It also handles partial-hour DST changes. */
function workingWindows(dateKey: string, start: string, end: string, timezone: string) {
  const key = `${timezone}|${dateKey}|${start}|${end}`;
  const cached = windowCache.get(key);
  if (cached) return cached;
  const wallStart = Date.parse(`${dateKey}T${start}:00.000Z`);
  const wallEnd = Date.parse(`${dateKey}T${end}:00.000Z`);
  const midnight = Date.parse(`${dateKey}T00:00:00.000Z`);
  const rangeStart = midnight - DAY_MS;
  const rangeEnd = midnight + 2 * DAY_MS;
  const segments: { from: number; to: number; offset: number }[] = [];
  let segmentStart = rangeStart;
  let offset = tzOffsetMs(new Date(rangeStart), timezone);
  // Locate timezone transitions, then find the exact transition second.
  for (let probe = rangeStart + 6 * 60 * 60_000; probe <= rangeEnd; probe += 6 * 60 * 60_000) {
    const nextOffset = tzOffsetMs(new Date(probe), timezone);
    if (nextOffset === offset) continue;
    let low = probe - 6 * 60 * 60_000;
    let high = probe;
    while (high - low > 1000) {
      const mid = Math.floor((low + high) / 2000) * 1000;
      if (tzOffsetMs(new Date(mid), timezone) === offset) low = mid;
      else high = mid;
    }
    segments.push({ from: segmentStart, to: high, offset });
    segmentStart = high;
    offset = nextOffset;
  }
  segments.push({ from: segmentStart, to: rangeEnd, offset });
  const windows = segments.flatMap((segment) => {
    const from = Math.max(segment.from, wallStart - segment.offset);
    const to = Math.min(segment.to, wallEnd - segment.offset);
    return to > from ? [{ from, to }] : [];
  });
  if (windowCache.size >= 512) windowCache.delete(windowCache.keys().next().value!);
  windowCache.set(key, windows);
  return windows;
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
      for (const window of workingWindows(dateKey, workStartTime, workEndTime, timezone)) {
        const overlapStart = Math.max(window.from, from.getTime());
        const overlapEnd = Math.min(window.to, to.getTime());
        if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
      }
    }
    dateKey = addDaysKey(dateKey, 1);
  }

  return total;
}

/** Inclusive pause windows (e.g. waiting-for-customer) subtracted from countable SLA time. */
export type SlaPauseInterval = { from: Date; to: Date };

/**
 * Working milliseconds that count against an SLA between `from` and `to`,
 * excluding any overlap with `pauseIntervals`. Business-hours calendars and
 * waiting-for-customer pauses compose: each pause window is measured with the
 * same calendar, then subtracted from the gross working elapsed.
 */
export function elapsedCountableMs(
  from: Date,
  to: Date,
  calendar: WorkingHoursCalendar | null,
  pauseIntervals: readonly SlaPauseInterval[] = [],
): number {
  const gross = elapsedWorkingMs(from, to, calendar);
  if (gross === 0 || pauseIntervals.length === 0) return gross;

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const clipped = pauseIntervals.map((pause) => ({
    from: Math.max(fromMs, pause.from.getTime()),
    to: Math.min(toMs, pause.to.getTime()),
  })).filter((pause) => pause.to > pause.from).sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const pause of clipped) {
    const previous = merged.at(-1);
    if (previous && pause.from <= previous.to) previous.to = Math.max(previous.to, pause.to);
    else merged.push({ ...pause });
  }
  const paused = merged.reduce((sum, pause) => sum + elapsedWorkingMs(new Date(pause.from), new Date(pause.to), calendar), 0);
  return Math.max(0, gross - paused);
}
