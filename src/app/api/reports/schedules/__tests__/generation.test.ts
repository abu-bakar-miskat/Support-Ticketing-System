import { beforeEach, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn(), build: vi.fn(), create: vi.fn(), run: vi.fn(), after: vi.fn(), find: vi.fn() }))
vi.mock("next/server", async (original) => ({ ...await original<object>(), after: m.after }))
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }))
vi.mock("@/lib/reporting/schedule-service", async () => {
  const { scheduleInputSchema } = await import("@/lib/reporting/schedule-settings")
  const { NextResponse } = await import("next/server")
  return { requireScheduleAdmin: m.auth, prepareScheduleReport: m.prepare,
    parseScheduleInput: (body: Record<string, unknown>) => scheduleInputSchema.parse({ ...body, name: body.name || "Preview" }),
    scheduleError: (error: Error) => NextResponse.json({ error: error.message }, { status: 400 }) }
})
vi.mock("@/lib/reporting/export-doc", () => ({ buildReportExportDoc: m.build }))
vi.mock("@/lib/reporting/report-export-job", () => ({ createReportExportJob: m.create, runReportExportJobAsSystem: m.run }))
vi.mock("@/lib/db", () => ({ prisma: { reportSchedule: { findFirst: m.find } } }))
import { POST as preview } from "../preview/route"
import { POST as generate } from "../generate/route"
import { POST as run } from "../[id]/run/route"
const request = () => new Request("http://localhost/api/reports/schedules/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportType: "user_performance", settings: { personId: "person" } }) })
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ tenantId: "tenant", profile: { id: "admin" } })
  m.prepare.mockResolvedValue({ scope: { kind: "department", tenantId: "tenant", subDepartmentIds: ["sub"] }, reportParams: { start: "2026-10-01", end: "2026-10-13", personId: "person" } })
  m.build.mockResolvedValue({ doc: { title: "Preview", sheets: [] }, rowCount: 0 })
  m.create.mockResolvedValue({ id: "job" })
})
it("previews the scoped report without creating a schedule or export job", async () => {
  const response = await preview(request())
  expect(response.status).toBe(200)
  expect((await response.json()).doc.title).toBe("Preview")
  expect(m.build).toHaveBeenCalledWith("user_performance", expect.objectContaining({ personId: "person" }), expect.objectContaining({ tenantId: "tenant" }))
  expect(m.create).not.toHaveBeenCalled()
  expect(m.after).not.toHaveBeenCalled()
})
it("queues a manual export with the validated snapshot and tenant identity", async () => {
  expect((await generate(request())).status).toBe(202)
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant", createdById: "admin", reportType: "user_performance", reportParams: expect.objectContaining({ personId: "person" }), context: { name: "Preview", kind: "manual" } }))
  expect(m.after).toHaveBeenCalledOnce()
  expect(m.run).not.toHaveBeenCalled()
})
it("rejects unauthorized previews and generation before calculating or saving data", async () => {
  m.auth.mockResolvedValue({ error: new Response(null, { status: 403 }) })
  expect((await preview(request())).status).toBe(403)
  expect((await generate(request())).status).toBe(403)
  expect(m.prepare).not.toHaveBeenCalled()
  expect(m.create).not.toHaveBeenCalled()
})
it("does not run a schedule from another tenant", async () => {
  m.find.mockResolvedValue(null)
  expect((await run(request(), { params: Promise.resolve({ id: "foreign" }) })).status).toBe(404)
  expect(m.find).toHaveBeenCalledWith({ where: { id: "foreign", tenantId: "tenant" } })
  expect(m.create).not.toHaveBeenCalled()
})
