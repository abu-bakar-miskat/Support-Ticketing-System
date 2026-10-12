import { describe, it, expect } from "vitest"
import {
  resolveAllowedResolutionMins,
  computeResolutionOutcome,
  resolutionUpdateOnStatusChange,
} from "./resolution-tracking"

describe("resolveAllowedResolutionMins", () => {
  it("prefers the SLA resolution target when present", () => {
    expect(resolveAllowedResolutionMins(120, 480)).toBe(120)
  })

  it("falls back to the ticket estimate when no SLA target", () => {
    expect(resolveAllowedResolutionMins(null, 480)).toBe(480)
    expect(resolveAllowedResolutionMins(undefined, 480)).toBe(480)
  })

  it("returns null when neither is set", () => {
    expect(resolveAllowedResolutionMins(null, null)).toBeNull()
    expect(resolveAllowedResolutionMins(undefined, undefined)).toBeNull()
  })

  it("treats a zero SLA target as a real target (not falsy fallback)", () => {
    expect(resolveAllowedResolutionMins(0, 480)).toBe(0)
  })
})

describe("computeResolutionOutcome", () => {
  const start = new Date("2026-09-14T09:00:00.000Z")

  it("computes whole minutes from saved start to saved end", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: start,
      resolvedAt: new Date("2026-09-14T11:30:00.000Z"),
      allowedMins: 180,
    })
    expect(out.resolutionDurationMins).toBe(150)
  })

  it("flags within-allowed resolution", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: start,
      resolvedAt: new Date("2026-09-14T11:00:00.000Z"), // 120 min
      allowedMins: 120,
    })
    expect(out.resolvedWithinAllowed).toBe(true)
  })

  it("flags exceeded resolution when past the allowed time", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: start,
      resolvedAt: new Date("2026-09-14T12:01:00.000Z"), // 181 min
      allowedMins: 180,
    })
    expect(out.resolvedWithinAllowed).toBe(false)
  })

  it("records no verdict when there is no allowed target", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: start,
      resolvedAt: new Date("2026-09-14T12:00:00.000Z"),
      allowedMins: null,
    })
    expect(out.resolutionDurationMins).toBe(180)
    expect(out.resolvedWithinAllowed).toBeNull()
  })

  it("returns nulls when the ticket never entered In Progress", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: null,
      resolvedAt: new Date("2026-09-14T12:00:00.000Z"),
      allowedMins: 60,
    })
    expect(out).toEqual({ resolutionDurationMins: null, resolvedWithinAllowed: null })
  })

  it("clamps negative elapsed time to zero", () => {
    const out = computeResolutionOutcome({
      inProgressStartedAt: new Date("2026-09-14T12:00:00.000Z"),
      resolvedAt: start,
      allowedMins: 60,
    })
    expect(out.resolutionDurationMins).toBe(0)
    expect(out.resolvedWithinAllowed).toBe(true)
  })
})

describe("resolutionUpdateOnStatusChange", () => {
  const now = new Date("2026-09-14T10:00:00.000Z")
  const base = {
    newClosedAt: null,
    currentInProgressStartedAt: null,
    slaResolutionTargetMins: undefined,
    estimatedTime: undefined,
    now,
  }

  it("stamps the start time on first entry to In Progress (default label)", () => {
    const out = resolutionUpdateOnStatusChange({ ...base, toStatus: "IN PROGRESS", isCompletion: false })
    expect(out).toEqual({
      inProgressStartedAt: now,
      resolutionDurationMins: null,
      resolvedWithinAllowed: null,
    })
  })

  it("recognizes canonical and aliased In Progress labels", () => {
    for (const label of ["In Progress", "in_progress", "Working", "Doing"]) {
      const out = resolutionUpdateOnStatusChange({ ...base, toStatus: label, isCompletion: false })
      expect(out.inProgressStartedAt).toBe(now)
    }
  })

  it("does NOT re-stamp when already started (preserves original start)", () => {
    const started = new Date("2026-09-14T09:00:00.000Z")
    const out = resolutionUpdateOnStatusChange({
      ...base,
      toStatus: "IN PROGRESS",
      isCompletion: false,
      currentInProgressStartedAt: started,
    })
    expect(out).toEqual({})
  })

  it("defers SLA completion to the authoritative lifecycle calculation", () => {
    const started = new Date("2026-09-14T09:00:00.000Z")
    const closed = new Date("2026-09-14T10:30:00.000Z") // 90 min
    const out = resolutionUpdateOnStatusChange({
      toStatus: "RESOLVED",
      isCompletion: true,
      newClosedAt: closed,
      currentInProgressStartedAt: started,
      slaResolutionTargetMins: 120,
      estimatedTime: 30,
      now,
    })
    expect(out).toEqual({})
  })

  it("flags exceeded on completion, falling back to estimate when no SLA", () => {
    const started = new Date("2026-09-14T09:00:00.000Z")
    const closed = new Date("2026-09-14T10:30:00.000Z") // 90 min
    const out = resolutionUpdateOnStatusChange({
      toStatus: "RESOLVED",
      isCompletion: true,
      newClosedAt: closed,
      currentInProgressStartedAt: started,
      slaResolutionTargetMins: null,
      estimatedTime: 60,
      now,
    })
    expect(out.resolvedWithinAllowed).toBe(false) // 90 > 60
  })

  it("returns empty for unrelated status changes (e.g. To Do, Blocked)", () => {
    for (const label of ["OPEN", "PAUSED", "ESCALATED"]) {
      expect(resolutionUpdateOnStatusChange({ ...base, toStatus: label, isCompletion: false })).toEqual({})
    }
  })
})
