import { describe, it, expect } from "vitest";
import { elapsedWorkingMs, type WorkingHoursCalendar } from "./sla-calendar";

const HOUR = 60 * 60 * 1000;

const utcCalendar = (over: Partial<WorkingHoursCalendar> = {}): WorkingHoursCalendar => ({
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5], // Mon-Fri
  workStartTime: "09:00",
  workEndTime: "17:00",
  holidays: [],
  ...over,
});

describe("elapsedWorkingMs", () => {
  it("returns to-from unchanged when calendar is null (no pausing)", () => {
    const from = new Date("2026-08-15T00:00:00.000Z"); // Saturday
    const to = new Date("2026-08-17T00:00:00.000Z"); // Monday, 48h later
    expect(elapsedWorkingMs(from, to, null)).toBe(48 * HOUR);
  });

  it("returns 0 when to <= from", () => {
    const t = new Date("2026-08-17T10:00:00.000Z");
    expect(elapsedWorkingMs(t, t, utcCalendar())).toBe(0);
    expect(elapsedWorkingMs(t, new Date(t.getTime() - 1000), utcCalendar())).toBe(0);
  });

  it("counts only the overlap with same-day business hours", () => {
    // Monday 10:00 -> 12:00, fully inside 09:00-17:00.
    const from = new Date("2026-08-17T10:00:00.000Z");
    const to = new Date("2026-08-17T12:00:00.000Z");
    expect(elapsedWorkingMs(from, to, utcCalendar())).toBe(2 * HOUR);
  });

  it("excludes time outside the daily window on both ends", () => {
    // Monday 06:00 -> 20:00 clips to 09:00-17:00 = 8h.
    const from = new Date("2026-08-17T06:00:00.000Z");
    const to = new Date("2026-08-17T20:00:00.000Z");
    expect(elapsedWorkingMs(from, to, utcCalendar())).toBe(8 * HOUR);
  });

  it("skips weekends entirely", () => {
    // Friday 16:00 -> Monday 10:00: Fri 16-17 (1h) + Mon 9-10 (1h), Sat/Sun skipped.
    const from = new Date("2026-08-14T16:00:00.000Z"); // Friday
    const to = new Date("2026-08-17T10:00:00.000Z"); // Monday
    expect(elapsedWorkingMs(from, to, utcCalendar())).toBe(2 * HOUR);
  });

  it("excludes holiday days even if they fall on a working weekday", () => {
    // Monday 2026-08-17 declared a holiday: only Tuesday 09:00-10:00 counts.
    const from = new Date("2026-08-17T00:00:00.000Z");
    const to = new Date("2026-08-18T10:00:00.000Z"); // Tuesday 10:00
    const calendar = utcCalendar({ holidays: [{ start: "2026-08-17", end: "2026-08-17" }] });
    expect(elapsedWorkingMs(from, to, calendar)).toBe(1 * HOUR);
  });

  it("respects a non-UTC timezone's local business window", () => {
    // Asia/Dhaka is a fixed UTC+6 offset (no DST) -> 09:00-17:00 local is 03:00-11:00 UTC.
    const calendar = utcCalendar({ timezone: "Asia/Dhaka" });
    // Monday 02:00 UTC -> 12:00 UTC clips to the 03:00-11:00 UTC window = 8h.
    const from = new Date("2026-08-17T02:00:00.000Z");
    const to = new Date("2026-08-17T12:00:00.000Z");
    expect(elapsedWorkingMs(from, to, calendar)).toBe(8 * HOUR);
  });

  it("accumulates across multiple full business days", () => {
    // Monday 09:00 -> Wednesday 17:00 = 3 full 8h days = 24h.
    const from = new Date("2026-08-17T09:00:00.000Z");
    const to = new Date("2026-08-19T17:00:00.000Z");
    expect(elapsedWorkingMs(from, to, utcCalendar())).toBe(24 * HOUR);
  });
});
