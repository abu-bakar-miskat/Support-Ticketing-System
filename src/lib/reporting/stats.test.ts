import { describe, it, expect } from "vitest"
import { mean, median, summarizeResolutionMinutes } from "./stats"

describe("mean", () => {
  it("computes the average", () => {
    expect(mean([10, 20, 30])).toBe(20)
  })
  it("is null for an empty array", () => {
    expect(mean([])).toBeNull()
  })
})

describe("median", () => {
  it("is the middle value for an odd-length array", () => {
    expect(median([5, 1, 3])).toBe(3)
  })
  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it("is null for an empty array", () => {
    expect(median([])).toBeNull()
  })
})

describe("summarizeResolutionMinutes", () => {
  it("returns count/mean/median together", () => {
    expect(summarizeResolutionMinutes([10, 20, 30])).toEqual({ count: 3, meanMins: 20, medianMins: 20 })
  })
  it("handles no samples", () => {
    expect(summarizeResolutionMinutes([])).toEqual({ count: 0, meanMins: null, medianMins: null })
  })
})
