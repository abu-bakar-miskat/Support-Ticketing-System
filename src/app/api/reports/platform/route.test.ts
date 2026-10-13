import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tenants: vi.fn(), departments: vi.fn(), subs: vi.fn(), tickets: vi.fn(), volumes: vi.fn(), statuses: vi.fn(), sla: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.auth }))
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }))
vi.mock("@/lib/sla-engine", () => ({ getSlaIndicatorViewForTicket: mocks.sla }))
vi.mock("@/lib/db", () => ({ prisma: {
  tenant: { findMany: mocks.tenants }, department: { findMany: mocks.departments }, subDepartment: { findMany: mocks.subs },
  ticket: { findMany: mocks.tickets, groupBy: mocks.volumes }, subDepartmentStatus: { findMany: mocks.statuses },
} }))
import { GET } from "./route"

const request = (query = "") => new Request(`http://localhost/api/reports/platform?from=2026-10-01&to=2026-10-12${query}`)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ profile: { id: "super", isSuperAdmin: true }, error: null })
  mocks.tenants.mockImplementation(async ({ where }) => [
    { id: "a", name: "Alpha", type: "company", status: "active", _count: { departments: 1, subDepartments: 1 } },
    { id: "b", name: "Beta", type: "agency", status: "active", _count: { departments: 0, subDepartments: 0 } },
  ].filter((tenant) => !where.id || tenant.id === where.id))
  mocks.volumes.mockResolvedValue([{ tenantId: "a", _count: { _all: 3 } }])
  mocks.departments.mockResolvedValue([{ id: "dept-a", name: "Support", tenantId: "a" }])
  mocks.subs.mockResolvedValue([{ id: "sub-a", name: "Helpdesk", departmentId: "dept-a", tenantId: "a" }])
  mocks.tickets.mockResolvedValue([])
  mocks.statuses.mockResolvedValue([])
})

it("rejects tenant admins before reading any platform data", async () => {
  mocks.auth.mockResolvedValue({ profile: { role: "admin", isSuperAdmin: false }, error: null })
  expect((await GET(request())).status).toBe(403)
  expect(mocks.tenants).not.toHaveBeenCalled()
})

it("returns the authentication error", async () => {
  mocks.auth.mockResolvedValue({ error: new Response(null, { status: 401 }) })
  expect((await GET(request())).status).toBe(401)
  expect(mocks.tenants).not.toHaveBeenCalled()
})

it.each(["from=bad&to=2026-10-12", "from=2026-02-30&to=2026-10-12", "from=2026-99-01&to=2026-10-12", "from=2026-10-13&to=2026-10-12"])("rejects invalid dates: %s", async (query) => {
  expect((await GET(new Request(`http://localhost/api/reports/platform?${query}`))).status).toBe(400)
  expect(mocks.tickets).not.toHaveBeenCalled()
})

it("loads tenant cards with counts only and does not fetch detailed reports", async () => {
  const response = await GET(request())
  const data = await response.json()
  expect(response.status).toBe(200)
  expect(data).toEqual({ mode: "tenants", tenants: [
    { id: "a", name: "Alpha", type: "company", status: "active", ticketCount: 3, departmentCount: 1, subDepartmentCount: 1 },
    { id: "b", name: "Beta", type: "agency", status: "active", ticketCount: 0, departmentCount: 0, subDepartmentCount: 0 },
  ] })
  expect(mocks.volumes).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: { in: ["a", "b"] }, deletedAt: null, isDraft: false, createdAt: { gte: expect.any(Date), lt: expect.any(Date) } }) }))
  expect(mocks.departments).not.toHaveBeenCalled()
  expect(mocks.subs).not.toHaveBeenCalled()
  expect(mocks.tickets).not.toHaveBeenCalled()
  expect(mocks.statuses).not.toHaveBeenCalled()
  expect(mocks.sla).not.toHaveBeenCalled()
})

it("fetches hierarchy and detailed metrics only for the tenant that was opened", async () => {
  const data = await (await GET(request("&tenantId=a&personId=ignored"))).json()
  expect(data.mode).toBe("tenant")
  expect(data.tenantReports).toEqual([expect.objectContaining({ id: "a", created: 0 })])
  expect(data.departmentReports).toEqual([expect.objectContaining({ id: "dept-a", created: 0 })])
  expect(data.subDepartmentReports).toEqual([expect.objectContaining({ id: "sub-a", created: 0 })])
  expect(mocks.tenants).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a", deletedAt: null } }))
  expect(mocks.departments).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: { in: ["a"] } } }))
  expect(mocks.subs).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: { in: ["a"] } } }))
  expect(mocks.volumes).not.toHaveBeenCalled()
  const query = mocks.tickets.mock.calls[0][0]
  expect(query.where).toMatchObject({ tenantId: { in: ["a"] }, deletedAt: null, isDraft: false })
  expect(query.select).not.toHaveProperty("assignee")
  expect(query.select).not.toHaveProperty("assignees")
})

it("binds a subdepartment report to its tenant and department", async () => {
  expect((await GET(request("&tenantId=a&departmentId=dept-a&subDepartmentId=sub-a"))).status).toBe(200)
  expect(mocks.subs).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: { in: ["a"] }, departmentId: "dept-a" } }))
  expect(mocks.tickets).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: { in: ["a"] }, subDepartmentId: { in: ["sub-a"] } }) }))
})

it("rejects unknown organizations and invalid parent selections", async () => {
  expect((await GET(request("&tenantId=a&departmentId=dept-b"))).status).toBe(404)
  expect((await GET(request("&tenantId=deleted"))).status).toBe(404)
  expect((await GET(request("&departmentId=dept-a"))).status).toBe(400)
  expect((await GET(request("&tenantId=a&subDepartmentId=sub-a"))).status).toBe(400)
  expect((await GET(request("&tenantId=a&departmentId=dept-a&subDepartmentId=sub-b"))).status).toBe(404)
  expect(mocks.tickets).not.toHaveBeenCalled()
})

it("counts a completion once at each organizational level and evaluates SLA without writes", async () => {
  const closedAt = new Date("2026-10-12T14:00:00Z")
  mocks.statuses.mockResolvedValue([{ subDepartmentId: "sub-a", label: "Delivered", category: "COMPLETE" }])
  mocks.tickets.mockResolvedValue([{ id: "one", tenantId: "a", createdAt: new Date("2026-10-01T09:00:00Z"), status: "Delivered", subDepartmentId: "sub-a", closedAt, slaTimer: { id: "timer" } }])
  mocks.sla.mockResolvedValue({ resolution: { status: "ON_TRACK" }, details: { resolutionStoppedAt: closedAt.toISOString() } })
  const data = await (await GET(request("&tenantId=a"))).json()
  for (const metric of [data.summary, data.tenantReports[0], data.departmentReports[0], data.subDepartmentReports[0]]) {
    expect(metric).toMatchObject({ created: 1, completed: 1, openCreated: 0, slaMet: 1, completionSamples: 1 })
  }
  expect(mocks.sla).toHaveBeenCalledWith("one", closedAt, { readOnly: true, includeDetails: true })
  expect(mocks.tickets.mock.calls[0][0].where.OR[1].closedAt.lt.getDate()).toBe(13)
})
