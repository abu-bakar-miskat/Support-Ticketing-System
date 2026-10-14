import { expect, it } from "vitest"
import { resolveReportRange } from "./report-period"
it("includes the full final day with an exclusive next-day boundary", () => {
  const range = resolveReportRange("2026-10-01", "2026-10-12")
  expect(range.start).toEqual(new Date("2026-10-01T00:00:00"))
  expect(range.end).toEqual(new Date("2026-10-13T00:00:00"))
  expect(new Date("2026-10-12T23:59:59.999") < range.end).toBe(true)
})
