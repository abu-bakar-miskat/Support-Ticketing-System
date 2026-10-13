import { beforeEach, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), create: vi.fn(), run: vi.fn(), prepare: vi.fn(), update: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: { reportSchedule: { findMany: m.find, updateMany: m.claim }, reportExportJob: { update: m.update } } }))
vi.mock("./report-export-job", () => ({ createReportExportJob: m.create, runReportExportJobAsSystem: m.run }))
vi.mock("./schedule-service", () => ({ prepareScheduleReport: m.prepare }))
import { runDueReportSchedules } from "./report-schedule"
const now = new Date("2026-10-13T09:00:00Z")
const schedule = { id: "schedule", name: "Weekly performance", tenantId: "tenant", createdById: "admin", frequency: "WEEKLY", format: "CSV", reportType: "user_performance", rangeDays: 30, settings: null, nextRunAt: now, updatedAt: now }
beforeEach(() => {
  vi.clearAllMocks()
  m.find.mockResolvedValue([schedule]); m.claim.mockResolvedValue({ count: 1 }); m.create.mockResolvedValue({ id: "job" })
  m.prepare.mockResolvedValue({ scope: { kind: "cross_department", tenantId: "tenant" }, reportParams: { start: "2026-09-13", end: "2026-10-13", personId: "person" } })
})
it("snapshots the scoped report and associates the run with its schedule", async () => {
  expect(await runDueReportSchedules(now)).toBe(1)
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ reportType: "user_performance", reportParams: expect.objectContaining({ personId: "person" }), context: { scheduleId: "schedule", name: "Weekly performance", kind: "scheduled" } }))
  expect(m.run).toHaveBeenCalledWith("job")
  expect(m.claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ nextRunAt: now, updatedAt: now, tenantId: "tenant", enabled: true }) }))
})
it("does not run a schedule claimed by a concurrent cron pass or changed by an editor", async () => {
  m.claim.mockResolvedValue({ count: 0 })
  expect(await runDueReportSchedules(now)).toBe(0)
  expect(m.create).not.toHaveBeenCalled()
})
it("records scope failures in history without broadening a deleted department", async () => {
  m.prepare.mockRejectedValue(new Error("Department unavailable"))
  await runDueReportSchedules(now)
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ scope: { kind: "none" } }))
  expect(m.update).toHaveBeenCalledWith({ where: { id: "job" }, data: { status: "FAILED", completedAt: now, failureReason: "Department unavailable" } })
  expect(m.run).not.toHaveBeenCalled()
})
