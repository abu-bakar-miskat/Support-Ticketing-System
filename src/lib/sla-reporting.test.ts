import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { customerWaitingMs, metricReport } from "./sla-reporting"

const at = (hour: number) => new Date(`2026-10-12T${String(hour).padStart(2, "0")}:00:00Z`)
const hour = 3_600_000

describe("SLA reporting", () => {
  it("clips and merges waits within the current cycle", () => {
    const waits = [{ from: at(8), to: at(10) }, { from: at(9), to: at(11) }, { from: at(12), to: at(14) }]
    expect(customerWaitingMs(at(9), at(13), waits)).toBe(3 * hour)
    const calendar = { timezone: "UTC", workingDays: [1], workStartTime: "10:00", workEndTime: "12:30", holidays: [] }
    expect(customerWaitingMs(at(9), at(13), waits, calendar)).toBe(1.5 * hour)
  })
  it("uses the authoritative breach boundary and preserves subminute overtime", () => {
    expect(metricReport({ status: "BREACHED", elapsedMs: 61_000, targetMs: 60_000, remainingMs: -1000 }, true))
      .toEqual({ allowedMs: 60_000, actualMs: 61_000, overtimeMs: 1000, compliant: false })
    expect(metricReport({ status: "AT_RISK", elapsedMs: 60_000, targetMs: 60_000, remainingMs: 0 }, true).compliant).toBe(true)
    expect(metricReport({ status: "ON_TRACK", elapsedMs: 0, targetMs: 60_000, remainingMs: 60_000 }, false).compliant).toBeNull()
  })
  it("verifies deployment detection cadence without running the sweep", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"))
    expect(config.crons.find((cron: { path: string }) => cron.path === "/api/cron/sla-check").schedule).toBe("*/15 * * * *")
  })
})
