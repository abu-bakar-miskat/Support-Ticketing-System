import { describe, it, expect } from "vitest";
import { evaluateSlaMetric, evaluateSlaIndicator, planReopen, type SlaTimerState } from "./sla-timer";

const MIN = 60_000;

describe("evaluateSlaMetric — SLA-05/06 (injected clock, no wall-clock reads)", () => {
  it("is ON_TRACK below the at-risk threshold", () => {
    const startedAt = new Date("2026-08-17T09:00:00.000Z");
    const now = new Date("2026-08-17T09:30:00.000Z"); // 30 of 60 target mins = 50%
    const result = evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 60, null);
    expect(result.status).toBe("ON_TRACK");
    expect(result.elapsedMs).toBe(30 * MIN);
    expect(result.remainingMs).toBe(30 * MIN);
  });

  it("is AT_RISK at/above the default 80% threshold", () => {
    const startedAt = new Date("2026-08-17T09:00:00.000Z");
    const now = new Date("2026-08-17T09:48:00.000Z"); // 48 of 60 = 80%
    const result = evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 60, null);
    expect(result.status).toBe("AT_RISK");
  });

  it("is BREACHED once elapsed reaches the target", () => {
    const startedAt = new Date("2026-08-17T09:00:00.000Z");
    const now = new Date("2026-08-17T10:05:00.000Z"); // 65 of 60 mins
    const result = evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 60, null);
    expect(result.status).toBe("BREACHED");
    expect(result.remainingMs).toBe(-5 * MIN);
  });

  it("honors a custom at-risk percentage", () => {
    const startedAt = new Date("2026-08-17T09:00:00.000Z");
    const now = new Date("2026-08-17T09:50:00.000Z"); // 50 of 60 = 83%
    expect(evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 60, null, 90).status).toBe("ON_TRACK");
    expect(evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 60, null, 80).status).toBe("AT_RISK");
  });

  it("freezes elapsed time once stopped, ignoring `now` moving further", () => {
    const startedAt = new Date("2026-08-17T09:00:00.000Z");
    const stoppedAt = new Date("2026-08-17T09:20:00.000Z"); // stopped at 20 of 60 = 33%
    const laterNow = new Date("2026-08-20T00:00:00.000Z"); // far in the future
    const result = evaluateSlaMetric({ startedAt, stoppedAt }, laterNow, 60, null);
    expect(result.status).toBe("ON_TRACK");
    expect(result.elapsedMs).toBe(20 * MIN);
  });

  it("pauses outside business hours when a calendar is supplied (SLA-04)", () => {
    // Friday 16:30 start, target 120 mins (2h), calendar Mon-Fri 09:00-17:00 UTC.
    const startedAt = new Date("2026-08-14T16:30:00.000Z"); // Friday
    const now = new Date("2026-08-17T09:30:00.000Z"); // Monday 09:30 -> 30 min into Monday
    const calendar = {
      timezone: "UTC",
      workingDays: [1, 2, 3, 4, 5],
      workStartTime: "09:00",
      workEndTime: "17:00",
      holidays: [],
    };
    // Working elapsed = Fri 16:30-17:00 (30m) + Mon 09:00-09:30 (30m) = 60m of 120m target = 50%.
    const withCalendar = evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 120, calendar);
    expect(withCalendar.elapsedMs).toBe(60 * MIN);
    expect(withCalendar.status).toBe("ON_TRACK");

    // Without pausing, the same wall-clock span would already be breached.
    const continuous = evaluateSlaMetric({ startedAt, stoppedAt: null }, now, 120, null);
    expect(continuous.status).toBe("BREACHED");
  });
});

describe("evaluateSlaIndicator — overall is the worse of the two metrics", () => {
  const base: SlaTimerState = {
    firstResponseTargetMins: 60,
    resolutionTargetMins: 480,
    firstResponseStartedAt: new Date("2026-08-17T09:00:00.000Z"),
    firstResponseStoppedAt: null,
    resolutionStartedAt: new Date("2026-08-17T09:00:00.000Z"),
    resolutionStoppedAt: null,
  };

  it("is ON_TRACK when both metrics are on track", () => {
    const now = new Date("2026-08-17T09:10:00.000Z");
    expect(evaluateSlaIndicator(base, now, null).overall).toBe("ON_TRACK");
  });

  it("surfaces BREACHED overall even if only one metric breached", () => {
    // First response (60 min target) breached; resolution (480 min) still fine.
    const now = new Date("2026-08-17T10:05:00.000Z");
    const indicator = evaluateSlaIndicator(base, now, null);
    expect(indicator.firstResponse.status).toBe("BREACHED");
    expect(indicator.resolution.status).toBe("ON_TRACK");
    expect(indicator.overall).toBe("BREACHED");
  });

  it("pauses resolution elapsed while waiting for customer, not first response", () => {
    const now = new Date("2026-08-17T13:00:00.000Z"); // 4h wall since 09:00
    const pauses = [
      { from: new Date("2026-08-17T10:00:00.000Z"), to: new Date("2026-08-17T12:00:00.000Z") }, // 2h paused
    ];
    const indicator = evaluateSlaIndicator(base, now, null, 80, pauses);
    // FR has no pauses — full 4h of 60m target → breached
    expect(indicator.firstResponse.elapsedMs).toBe(4 * 60 * MIN);
    // Resolution excludes 2h pause → 2h of 480m target
    expect(indicator.resolution.elapsedMs).toBe(2 * 60 * MIN);
    expect(indicator.resolution.status).toBe("ON_TRACK");
  });
});

describe("planReopen — fresh reopen cycle", () => {
  it("resets both clocks and all four notification guards", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(planReopen(now)).toEqual({
      firstResponseStartedAt: now, resolutionStartedAt: now,
      firstResponseStoppedAt: null, resolutionStoppedAt: null,
      firstResponseAtRiskNotifiedAt: null, firstResponseBreachNotifiedAt: null,
      resolutionAtRiskNotifiedAt: null, resolutionBreachNotifiedAt: null,
    });
  });
  it("starts resolution at zero, excluding previous work and closed time", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    const reopened = planReopen(now);
    expect(evaluateSlaMetric({ startedAt: reopened.resolutionStartedAt, stoppedAt: null }, now, 30, null).elapsedMs).toBe(0);
  });
});
