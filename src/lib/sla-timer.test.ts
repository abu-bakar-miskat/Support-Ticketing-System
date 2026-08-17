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
});

describe("planReopen — OQ-03", () => {
  it("starts a fresh first-response cycle", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const fields = planReopen(
      { resolutionStartedAt: new Date("2026-08-10T09:00:00.000Z"), resolutionStoppedAt: null },
      now,
    );
    expect(fields.firstResponseStartedAt).toEqual(now);
    expect(fields.firstResponseStoppedAt).toBeNull();
    expect(fields.firstResponseAtRiskNotifiedAt).toBeNull();
    expect(fields.firstResponseBreachNotifiedAt).toBeNull();
    expect(fields.resolutionStoppedAt).toBeNull();
  });

  it("resumes resolution by shifting startedAt past the closed period, preserving prior elapsed progress", () => {
    const resolutionStartedAt = new Date("2026-08-10T09:00:00.000Z");
    const resolutionStoppedAt = new Date("2026-08-12T09:00:00.000Z"); // closed after 48h elapsed
    const reopenAt = new Date("2026-08-20T00:00:00.000Z"); // sat closed for ~8 days

    const beforeClose = evaluateSlaMetric(
      { startedAt: resolutionStartedAt, stoppedAt: resolutionStoppedAt },
      resolutionStoppedAt,
      1000,
      null,
    );

    const reopened = planReopen({ resolutionStartedAt, resolutionStoppedAt }, reopenAt);
    const atReopenInstant = evaluateSlaMetric(
      { startedAt: reopened.resolutionStartedAt, stoppedAt: reopened.resolutionStoppedAt },
      reopenAt,
      1000,
      null,
    );

    // Elapsed at the moment of reopen equals what had accrued before the close —
    // none of the closed-duration counted against the SLA.
    expect(atReopenInstant.elapsedMs).toBe(beforeClose.elapsedMs);

    // An hour after reopening, exactly one more hour has accrued.
    const anHourLater = new Date(reopenAt.getTime() + 60 * MIN);
    const afterMore = evaluateSlaMetric(
      { startedAt: reopened.resolutionStartedAt, stoppedAt: null },
      anHourLater,
      1000,
      null,
    );
    expect(afterMore.elapsedMs).toBe(beforeClose.elapsedMs + 60 * MIN);
  });

  it("does not shift resolutionStartedAt when it was never stopped", () => {
    const resolutionStartedAt = new Date("2026-08-10T09:00:00.000Z");
    const reopened = planReopen({ resolutionStartedAt, resolutionStoppedAt: null }, new Date("2026-08-20T00:00:00.000Z"));
    expect(reopened.resolutionStartedAt).toEqual(resolutionStartedAt);
  });
});
