import { describe, it, expect } from "vitest"
import { getAgreementExpiry, renewalStatusLabel } from "./agreement-expiry"

const NOW = new Date("2026-09-18T00:00:00.000Z")
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000)

describe("getAgreementExpiry", () => {
  it("flags an agreement inside the threshold as expiring_soon", () => {
    const f = getAgreementExpiry(inDays(12), "ACTIVE", NOW)
    expect(f).toMatchObject({ state: "expiring_soon", daysUntil: 12, label: "Expires in 12 days" })
  })

  it("says 'Expires today' at zero days", () => {
    const f = getAgreementExpiry(inDays(0), "ACTIVE", NOW)
    expect(f).toMatchObject({ state: "expiring_soon", label: "Expires today" })
  })

  it("does not flag an agreement beyond the threshold", () => {
    expect(getAgreementExpiry(inDays(45), "ACTIVE", NOW).state).toBe("ok")
  })

  it("flags a past-due ACTIVE agreement as expired even without a status change", () => {
    const f = getAgreementExpiry(inDays(-3), "ACTIVE", NOW)
    expect(f).toMatchObject({ state: "expired", label: "Expired 3 days ago" })
  })

  it("flags an EXPIRED agreement as expired regardless of date", () => {
    expect(getAgreementExpiry(inDays(10), "EXPIRED", NOW).state).toBe("expired")
  })

  it("never flags settled (renewed/cancelled) agreements", () => {
    expect(getAgreementExpiry(inDays(5), "RENEWED", NOW).state).toBe("ok")
    expect(getAgreementExpiry(inDays(-5), "CANCELLED", NOW).state).toBe("ok")
  })

  it("respects a custom threshold", () => {
    expect(getAgreementExpiry(inDays(50), "ACTIVE", NOW, 60).state).toBe("expiring_soon")
  })

  it("pluralizes a single day", () => {
    expect(getAgreementExpiry(inDays(1), "ACTIVE", NOW).label).toBe("Expires in 1 day")
  })
})

describe("renewalStatusLabel", () => {
  it("maps known statuses and falls back gracefully", () => {
    expect(renewalStatusLabel("PENDING_RENEWAL")).toBe("Pending renewal")
    expect(renewalStatusLabel(null)).toBe("—")
    expect(renewalStatusLabel("WEIRD")).toBe("WEIRD")
  })
})
