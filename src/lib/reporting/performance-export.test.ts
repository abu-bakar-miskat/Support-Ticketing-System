import { expect, it, vi } from "vitest"
vi.mock("./performance-overview", () => ({ loadPerformanceOverview: vi.fn() }))
vi.mock("./volume-report", () => ({ computeVolumeReport: vi.fn() }))
vi.mock("./resolution-time-report", () => ({ computeResolutionTimeReport: vi.fn() }))
vi.mock("./custom-field-report", () => ({ computeCustomFieldReport: vi.fn() }))
vi.mock("./cross-department-report", () => ({ computeCrossDepartmentReport: vi.fn() }))
import { loadPerformanceOverview } from "./performance-overview"
import { buildReportExportDoc } from "./export-doc"
import { buildReportsExportDoc } from "@/lib/exports/reports-export-doc"
import { summarizeUserPerformance } from "./user-performance"

it("uses the live performance calculation and identical export sheets for scheduled reports", async () => {
  const start = new Date("2026-10-01"), end = new Date("2026-10-13")
  const person = { id: "person", name: "Alice" }
  const summary = summarizeUserPerformance([{
    id: "ticket", title: "Access", ticketNumber: 1, subDepartment: { prefix: "SUP" }, priority: "High",
    assignee: person, assignees: [], createdAt: start, closedAt: new Date("2026-10-02"), completed: true,
    replyAt: new Date("2026-10-01T01:00:00Z"), responseStoppedAt: null, sla: null, intake: null, activityLogs: [], slaTimer: null,
  }], [person], start, end, "person")
  const report = { ...summary, ticketSources: { manual: 1, support: 0, portal: 0, mailbox: 0 }, personPerformance: [], totals: { total: 1, open: 0, closed: 1 }, memberOptions: [{ ...person, avatarUrl: null }] }
  vi.mocked(loadPerformanceOverview).mockResolvedValue(report)
  const scope = { kind: "department" as const, tenantId: "tenant", subDepartmentIds: ["sub"] }
  const generated = await buildReportExportDoc("user_performance", { start: start.toISOString(), end: end.toISOString(), personId: "person", timezone: "Europe/London" }, scope)
  const live = buildReportsExportDoc({ overview: { ...report, created: [], resolved: [], bugResolution: [], commentLoad: [], statusDist: [], priorityDist: [], workload: [], projectTickets: [], moduleTickets: [], projectOptions: [], crossDept: [] }, rangeLabel: "October" })
  expect(loadPerformanceOverview).toHaveBeenCalledWith(scope, start, end, "person")
  expect(generated.doc.sheets).toEqual(live.sheets)
  expect(generated.doc.title).toBe("User Performance Report")
  expect(generated.doc.subtitle).toContain("Europe/London")
  expect(generated.doc.sheets.find((sheet) => sheet.name === "Person Performance")?.rows[0]).toMatchObject({ name: "Alice", completed: 1, High: 1 })
})
it("rejects invalid ranges before calculating a report", async () => {
  vi.clearAllMocks()
  await expect(buildReportExportDoc("user_performance", { start: "bad", end: "2026-10-13" }, { kind: "none" })).rejects.toThrow("Invalid report date range")
  expect(loadPerformanceOverview).not.toHaveBeenCalled()
})
