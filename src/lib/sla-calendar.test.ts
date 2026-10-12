import { describe, it, expect } from "vitest";
import { elapsedWorkingMs, elapsedCountableMs, type WorkingHoursCalendar } from "./sla-calendar";

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

describe("elapsedCountableMs — waiting-for-customer pauses", () => {
  it("equals elapsedWorkingMs when there are no pause intervals", () => {
    const from = new Date("2026-08-17T10:00:00.000Z");
    const to = new Date("2026-08-17T14:00:00.000Z");
    expect(elapsedCountableMs(from, to, null, [])).toBe(elapsedWorkingMs(from, to, null));
  });

  it("subtracts continuous pause windows from wall-clock elapsed", () => {
    const from = new Date("2026-08-17T09:00:00.000Z");
    const to = new Date("2026-08-17T13:00:00.000Z"); // 4h gross
    const pauses = [
      { from: new Date("2026-08-17T10:00:00.000Z"), to: new Date("2026-08-17T12:00:00.000Z") }, // 2h paused
    ];
    expect(elapsedCountableMs(from, to, null, pauses)).toBe(2 * HOUR);
  });

  it("subtracts only the business-hours portion of a pause when a calendar is set", () => {
    // Monday 08:00 -> 18:00 = 8h working (09-17). Pause 12:00-14:00 = 2h working.
    const from = new Date("2026-08-17T08:00:00.000Z");
    const to = new Date("2026-08-17T18:00:00.000Z");
    const pauses = [
      { from: new Date("2026-08-17T12:00:00.000Z"), to: new Date("2026-08-17T14:00:00.000Z") },
    ];
    expect(elapsedCountableMs(from, to, utcCalendar(), pauses)).toBe(6 * HOUR);
  });

  it("clips pause intervals to the evaluation window", () => {
    const from = new Date("2026-08-17T10:00:00.000Z");
    const to = new Date("2026-08-17T12:00:00.000Z");
    const pauses = [
      { from: new Date("2026-08-17T09:00:00.000Z"), to: new Date("2026-08-17T11:00:00.000Z") }, // only 10-11 overlaps
    ];
    expect(elapsedCountableMs(from, to, null, pauses)).toBe(1 * HOUR);
  });
});

describe("Stage 4 DST and pause composition", () => {
  it.each([
    ["2026-03-29T00:00:00Z", "2026-03-29T04:00:00Z", 2],
    ["2026-10-24T23:00:00Z", "2026-10-25T04:00:00Z", 4],
  ])("counts actual working instants across the UK clock change (%s)", (from, to, hours) => {
    const calendar = utcCalendar({ timezone: "Europe/London", workingDays: [0], workStartTime: "00:30", workEndTime: "03:30" })
    expect(elapsedWorkingMs(new Date(from), new Date(to), calendar)).toBe(hours * HOUR)
  })
  it("clips a working boundary inside the skipped spring hour", () => {
    const calendar = utcCalendar({ timezone: "Europe/London", workingDays: [0], workStartTime: "01:30", workEndTime: "02:30" })
    expect(elapsedWorkingMs(new Date("2026-03-29T00:00:00Z"), new Date("2026-03-29T04:00:00Z"), calendar)).toBe(HOUR / 2)
  })
  it("counts only qualifying parts of the repeated autumn hour", () => {
    const calendar = utcCalendar({ timezone: "Europe/London", workingDays: [0], workStartTime: "01:30", workEndTime: "02:30" })
    expect(elapsedWorkingMs(new Date("2026-10-25T00:00:00Z"), new Date("2026-10-25T04:00:00Z"), calendar)).toBe(1.5 * HOUR)
  })
  it("uses the correct offset for a New York opening after a spring transition", () => {
    const calendar = utcCalendar({ timezone: "America/New_York", workingDays: [0], workStartTime: "03:00", workEndTime: "04:00" })
    expect(elapsedWorkingMs(new Date("2026-03-08T07:00:00Z"), new Date("2026-03-08T08:00:00Z"), calendar)).toBe(HOUR)
  })
  it("uses configured ordinary opening hours across the UK autumn weekend", () => {
    const calendar = utcCalendar({ timezone: "Europe/London", workStartTime: "08:30", workEndTime: "17:00" })
    expect(elapsedWorkingMs(new Date("2026-10-23T15:30:00Z"), new Date("2026-10-26T09:00:00Z"), calendar)).toBe(HOUR)
  })
  it("subtracts overlapping and duplicate customer/closed pauses only once", () => {
    const pauses = [
      { from: new Date("2026-10-12T10:00:00Z"), to: new Date("2026-10-12T12:00:00Z") },
      { from: new Date("2026-10-12T11:00:00Z"), to: new Date("2026-10-12T13:00:00Z") },
      { from: new Date("2026-10-12T10:00:00Z"), to: new Date("2026-10-12T12:00:00Z") },
    ]
    expect(elapsedCountableMs(new Date("2026-10-12T09:00:00Z"), new Date("2026-10-12T14:00:00Z"), utcCalendar(), pauses)).toBe(2 * HOUR)
  })
})
