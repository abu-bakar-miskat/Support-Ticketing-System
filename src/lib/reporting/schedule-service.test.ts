import { beforeEach, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ auth: vi.fn(), scope: vi.fn(), department: vi.fn(), person: vi.fn(), feature: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireAuth: m.auth }))
vi.mock("./report-scope", () => ({ resolveReportScope: m.scope }))
vi.mock("@/lib/feature-flags", () => ({ assertFeatureEnabled: m.feature }))
vi.mock("@/lib/db", () => ({ prisma: { department: { findFirst: m.department }, profile: { findFirst: m.person } } }))
import { parseScheduleInput, prepareScheduleReport, requireScheduleAdmin, resolveScheduleSelection } from "./schedule-service"
import { scheduleSettingsSchema } from "./schedule-settings"
const settings = scheduleSettingsSchema.parse({ departmentId: "department", personId: "person", period: "previous_day", timezone: "Europe/London" })
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ profile: { id: "admin" }, error: null })
  m.scope.mockResolvedValue({ kind: "cross_department", tenantId: "tenant" })
  m.feature.mockResolvedValue({ ok: true })
  m.department.mockResolvedValue({ name: "Support", subDepartments: [{ id: "sub" }] })
  m.person.mockResolvedValue({ name: "Alice" })
})
it("requires tenant-wide admin permission before schedule access", async () => {
  m.scope.mockResolvedValue({ kind: "department", tenantId: "tenant", subDepartmentIds: ["sub"] })
  expect((await requireScheduleAdmin()).error?.status).toBe(403)
})
it("preserves an authentication rejection", async () => {
  m.auth.mockResolvedValue({ error: new Response(null, { status: 401 }) })
  expect((await requireScheduleAdmin()).error?.status).toBe(401)
  expect(m.scope).not.toHaveBeenCalled()
})
it("binds department and person lookups to the active tenant and selected department", async () => {
  const result = await resolveScheduleSelection("tenant", settings)
  expect(m.department).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "department", tenantId: "tenant" } }))
  expect(m.person).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "person", tenantMemberships: { some: { tenantId: "tenant", isActive: true } }, memberships: { some: { subDepartmentId: { in: ["sub"] }, isActive: true } } }) }))
  expect(result).toEqual({ scope: { kind: "department", tenantId: "tenant", subDepartmentIds: ["sub"] }, scopeLabel: "Support · Alice" })
})
it("rejects foreign or deleted selections rather than widening the report", async () => {
  m.department.mockResolvedValue(null)
  await expect(resolveScheduleSelection("tenant", settings)).rejects.toThrow("department")
  expect(m.person).not.toHaveBeenCalled()
  m.department.mockResolvedValue({ name: "Support", subDepartments: [{ id: "sub" }] })
  m.person.mockResolvedValue(null)
  await expect(resolveScheduleSelection("tenant", settings)).rejects.toThrow("person")
})
it("snapshots the calendar period, scoped person, and timezone for generation", async () => {
  const result = await prepareScheduleReport("tenant", settings, 30, new Date("2026-10-13T08:00:00Z"))
  expect(result.reportParams).toEqual({ start: "2026-10-11T23:00:00.000Z", end: "2026-10-12T23:00:00.000Z", personId: "person", scopeLabel: "Support · Alice", timezone: "Europe/London" })
})
it("checks the tenant export feature before reading report selections", async () => {
  m.feature.mockResolvedValue({ ok: false, error: "Reports disabled" })
  await expect(prepareScheduleReport("tenant", settings, 30)).rejects.toThrow("Reports disabled")
  expect(m.department).not.toHaveBeenCalled()
})
it("allows draft previews without a name but requires a name to save", () => {
  expect(parseScheduleInput({ name: "" }, true).name).toBeTruthy()
  expect(() => parseScheduleInput({ name: "" })).toThrow()
})
