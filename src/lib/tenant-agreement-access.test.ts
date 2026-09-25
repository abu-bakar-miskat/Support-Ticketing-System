import { describe, it, expect } from "vitest";
import { evaluateAgreementValidity, type AgreementTermLike } from "./tenant-agreement-access";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function term(
  startOffsetDays: number,
  endOffsetDays: number,
  renewalStatus: AgreementTermLike["renewalStatus"] = "ACTIVE",
): AgreementTermLike {
  const day = 24 * 60 * 60 * 1000;
  return {
    startDate: new Date(NOW.getTime() + startOffsetDays * day),
    endDate: new Date(NOW.getTime() + endOffsetDays * day),
    renewalStatus,
  };
}

describe("evaluateAgreementValidity", () => {
  it("flags a tenant with no agreements as missing", () => {
    expect(evaluateAgreementValidity([], NOW)).toEqual({ valid: false, reason: "missing" });
    expect(evaluateAgreementValidity(null, NOW)).toEqual({ valid: false, reason: "missing" });
  });

  it("is valid when an ACTIVE term covers today", () => {
    expect(evaluateAgreementValidity([term(-30, 30)], NOW)).toEqual({ valid: true, reason: null });
  });

  it("is valid for PENDING_RENEWAL and RENEWED terms still in-window", () => {
    expect(evaluateAgreementValidity([term(-10, 10, "PENDING_RENEWAL")], NOW).valid).toBe(true);
    expect(evaluateAgreementValidity([term(-10, 10, "RENEWED")], NOW).valid).toBe(true);
  });

  it("flags a past-window term as expired", () => {
    expect(evaluateAgreementValidity([term(-60, -1)], NOW)).toEqual({ valid: false, reason: "expired" });
  });

  it("flags an EXPIRED/CANCELLED term as expired even if the window still covers today", () => {
    expect(evaluateAgreementValidity([term(-10, 10, "EXPIRED")], NOW).reason).toBe("expired");
    expect(evaluateAgreementValidity([term(-10, 10, "CANCELLED")], NOW).reason).toBe("expired");
  });

  it("flags a future-only term (not yet started) as invalid", () => {
    expect(evaluateAgreementValidity([term(5, 40)], NOW)).toEqual({ valid: false, reason: "invalid" });
  });

  it("is valid when ANY term covers today, ignoring lapsed ones", () => {
    expect(
      evaluateAgreementValidity([term(-400, -370, "EXPIRED"), term(-5, 360)], NOW).valid,
    ).toBe(true);
  });
});
