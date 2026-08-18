import { describe, it, expect } from "vitest"
import { precedingEquivalentRange } from "./date-range"

describe("precedingEquivalentRange", () => {
  it("returns the immediately-preceding window of the same length", () => {
    const start = new Date("2026-02-01T00:00:00.000Z")
    const end = new Date("2026-03-01T00:00:00.000Z") // 28 days
    const result = precedingEquivalentRange(start, end)
    expect(result.end).toEqual(start)
    expect(result.end.getTime() - result.start.getTime()).toBe(end.getTime() - start.getTime())
  })

  it("handles a one-day range", () => {
    const start = new Date("2026-01-15T00:00:00.000Z")
    const end = new Date("2026-01-16T00:00:00.000Z")
    const result = precedingEquivalentRange(start, end)
    expect(result).toEqual({ start: new Date("2026-01-14T00:00:00.000Z"), end: new Date("2026-01-15T00:00:00.000Z") })
  })
})
