import { describe, expect, it } from "vitest"
import { slaOutcome, summarizeTicketPerformance, ticketSource, type PerformanceTicket } from "./ticket-performance"
import { evaluateSlaIndicator } from "@/lib/sla-timer"
import { buildReportsExportDoc } from "@/lib/exports/reports-export-doc"
import type { ReportsOverview } from "@/lib/api/reports"
import { summarizeUserPerformance } from "./user-performance"
import { buildCsv } from "@/lib/exports/to-csv"
import { buildXlsx } from "@/lib/exports/to-xlsx"
import { buildPdf } from "@/lib/exports/to-pdf"

const alice = { id: "alice", name: "Alice" }
const bob = { id: "bob", name: "Bob" }
const base: PerformanceTicket = {
  id: "ticket", assignee: alice, assignees: [{ user: alice }, { user: bob }],
  intake: null, activityLogs: [], slaTimer: null,
}
const startedAt = new Date("2026-10-01T09:00:00Z")
const stoppedAt = new Date("2026-10-01T09:30:00Z")
const sla = evaluateSlaIndicator({
  firstResponseStartedAt: startedAt, firstResponseStoppedAt: stoppedAt,
  resolutionStartedAt: startedAt, resolutionStoppedAt: stoppedAt,
  firstResponseTargetMins: 60, resolutionTargetMins: 120,
}, stoppedAt, null)

describe("ticket performance", () => {
  it("classifies each creation origin once, including portal submissions whose API key was deleted", () => {
    const tickets = [
      base,
      { ...base, intake: { apiKeyId: null, portalIdempotencyKey: null } },
      { ...base, intake: { apiKeyId: "key", portalIdempotencyKey: null } },
      { ...base, intake: { apiKeyId: null, portalIdempotencyKey: "portal_hash" } },
      { ...base, activityLogs: [{ metadata: { source: "email" } }] },
      { ...base, slaTimer: { source: "mailbox" } },
    ]
    expect(tickets.map(ticketSource)).toEqual(["manual", "support", "portal", "portal", "mailbox", "mailbox"])
    const result = summarizeTicketPerformance(tickets.map((t) => ({ ...t, completed: false, sla: null })), [])
    expect(Object.values(result.ticketSources).reduce((sum, count) => sum + count, 0)).toBe(tickets.length)
  })

  it("keeps pending and policy-free tickets separate from completed SLA successes", () => {
    expect(slaOutcome(sla, false)).toBe("slaPending")
    expect(slaOutcome(sla, true)).toBe("slaMet")
    expect(slaOutcome(null, true)).toBe("noSla")
    expect(slaOutcome({ ...sla, overall: "BREACHED" }, false)).toBe("slaMissed")
    expect(slaOutcome({ ...sla, overall: "BREACHED" }, true)).toBe("slaMissed")
  })

  it("deduplicates the primary assignee and credits co-assignees, zero-ticket members, and unassigned tickets", () => {
    const result = summarizeTicketPerformance([
      { ...base, completed: true, sla },
      { ...base, id: "open", completed: false, sla: { ...sla, overall: "BREACHED" } },
      { ...base, id: "free", assignee: null, assignees: [], completed: false, sla: null },
    ], [alice, bob, { id: "carol", name: "Carol" }])
    expect(result.personPerformance.find((p) => p.personId === "alice")).toMatchObject({ assigned: 2, completed: 1, slaMet: 1, slaMissed: 1 })
    expect(result.personPerformance.find((p) => p.personId === "bob")).toMatchObject({ assigned: 2 })
    expect(result.personPerformance.find((p) => p.personId === "carol")).toMatchObject({ assigned: 0 })
    expect(result.personPerformance.find((p) => p.personId === null)).toMatchObject({ assigned: 1, noSla: 1 })
  })

  it("exports only the selected person's performance in all supported formats", async () => {
    const summary = summarizeTicketPerformance([{ ...base, completed: true, sla }], [alice, bob], "bob")
    expect(summary.personPerformance.map((p) => p.name)).toEqual(["Bob"])
    const overview: ReportsOverview = {
      ...summary,
      ...summarizeUserPerformance([{ ...base, completed: true, sla, title: "Test", ticketNumber: 1, subDepartment: { prefix: "SUP" }, priority: "High", createdAt: startedAt, closedAt: stoppedAt, responseStoppedAt: stoppedAt, replyAt: stoppedAt }], [alice, bob], startedAt, new Date("2026-10-02"), "bob"),
      totals: { total: 1, closed: 1, open: 0 },
      created: [], resolved: [], bugResolution: [], commentLoad: [], statusDist: [], priorityDist: [],
      workload: [], projectTickets: [], moduleTickets: [], projectOptions: [], memberOptions: [], crossDept: [],
    }
    const doc = buildReportsExportDoc({ overview, rangeLabel: "1–12 October", scopeLabel: "Bob" })
    const people = doc.sheets.find((s) => s.name === "Person Performance")!
    expect(people.rows).toEqual([expect.objectContaining({ name: "Bob", completed: 1, High: 1 })])
    expect(doc.sheets.find((s) => s.name === "Ticket Sources")?.rows).toContainEqual({ source: "Custom / manual", count: 1 })
    expect(buildCsv(doc)).toContain("Response SLA")
    expect((await buildXlsx(doc)).length).toBeGreaterThan(0)
    expect((await buildPdf(doc)).subarray(0, 4).toString()).toBe("%PDF")
  })
})
