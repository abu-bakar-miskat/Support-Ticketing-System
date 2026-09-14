import { describe, it, expect } from "vitest";
import { computeRemaining, COOLDOWN_SECONDS } from "./resend-code-button";

describe("computeRemaining", () => {
  const sentAt = 1_000_000;

  it("is the full window immediately after a send", () => {
    expect(computeRemaining(sentAt, sentAt)).toBe(COOLDOWN_SECONDS);
  });

  it("counts down as time elapses", () => {
    expect(computeRemaining(sentAt, sentAt + 1_000)).toBe(89);
    expect(computeRemaining(sentAt, sentAt + 45_000)).toBe(45);
  });

  it("reaches 0 exactly at the window boundary and re-enables", () => {
    expect(computeRemaining(sentAt, sentAt + 90_000)).toBe(0);
    expect(computeRemaining(sentAt, sentAt + 120_000)).toBe(0);
  });

  it("treats a missing/invalid send time as no cooldown", () => {
    expect(computeRemaining(0)).toBe(0);
    expect(computeRemaining(Number.NaN)).toBe(0);
  });
});
