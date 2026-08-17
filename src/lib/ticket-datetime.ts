/**
 * Helpers for the optional time-of-day on a ticket's start/due dates.
 *
 * All-day sentinels (no explicit time chosen):
 *   - start → 00:00
 *   - due   → 23:59:59.999
 * A value that differs from its sentinel is treated as an explicit time.
 *
 * NOTE: detection uses local getHours/getMinutes and assumes the app runs in a
 * single timezone (server and clients aligned), matching the existing naive
 * date handling elsewhere in the codebase.
 */

/** Local calendar day as yyyy-MM-dd — never use toISOString().slice (UTC off-by-one). */
export function formatCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a yyyy-MM-dd (or full ISO) string into a local Date at start-of-day. */
export function parseCalendarDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, m - 1, day, 0, 0, 0, 0);
  }
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function startHasTime(d: Date): boolean {
  return !(d.getHours() === 0 && d.getMinutes() === 0);
}

export function dueHasTime(d: Date): boolean {
  const h = d.getHours();
  const m = d.getMinutes();
  // All-day due sentinel is 23:59. Midnight is never an intentional end time in
  // this app (and often appears from UTC round-trips) — treat both as "no time".
  if (h === 23 && m === 59) return false;
  if (h === 0 && m === 0) return false;
  return true;
}

/** "HH:mm" in 24-hour form for the given date's local time. */
export function formatTimeHM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** True when a payload date string carries an explicit time component. */
export function payloadHasTime(value: string): boolean {
  return value.includes("T");
}

/** Serialize a ticket date for client props — calendar day unless user set an explicit time. */
export function serializeTicketDateIso(d: Date, role: "start" | "due"): string {
  const day = formatCalendarDate(d);
  if (role === "start" && startHasTime(d)) return `${day}T${formatTimeHM(d)}`;
  if (role === "due" && dueHasTime(d)) return `${day}T${formatTimeHM(d)}`;
  return day;
}

/** Parse a ticket date string from client props into a local calendar Date. */
export function parseTicketDateIso(value: string): Date {
  return parseCalendarDate(value);
}

/** True when start/due refer to the same calendar day (incl. date-only + end-of-day sentinel). */
export function isSameCalendarDay(
  startIso: string | null | undefined,
  dueIso: string | null | undefined,
): boolean {
  if (!startIso || !dueIso) return false;
  const startDay = parseCalendarDate(startIso);
  const dueDay = parseCalendarDate(dueIso);
  return (
    startDay.getFullYear() === dueDay.getFullYear() &&
    startDay.getMonth() === dueDay.getMonth() &&
    startDay.getDate() === dueDay.getDate()
  );
}

/** Parse a start-date payload: exact instant when timed, else local start-of-day. */
export function parseStartDatePayload(value: string): Date {
  if (payloadHasTime(value)) return new Date(value);
  return parseCalendarDate(value.slice(0, 10));
}

/** Parse a due-date payload: exact instant when timed, else local end-of-day. */
export function parseDueDatePayload(value: string): Date {
  if (payloadHasTime(value)) return new Date(value);
  const d = parseCalendarDate(value.slice(0, 10));
  d.setHours(23, 59, 59, 999);
  return d;
}
