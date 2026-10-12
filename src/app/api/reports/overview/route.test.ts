import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), groupBy: vi.fn(), tickets: vi.fn(), profiles: vi.fn(), statuses: vi.fn(), sla: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.auth }))
vi.mock("@/lib/request-scope", () => ({ runAsSystem: (fn: () => unknown) => fn() }))
vi.mock("@/lib/dept-scope", () => ({ getProfileDeptScope: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/reporting/analytics-scope", () => ({
  resolveAnalyticsScope: vi.fn().mockResolvedValue({ ticketWhere: { tenantId: "tenant", subDepartmentId: { in: ["dept"] } }, subDepartmentIds: ["dept"] }),
}))
vi.mock("@/lib/sla-engine", () => ({ getSlaIndicatorForTicket: mocks.sla }))
vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { groupBy: mocks.groupBy, findMany: mocks.tickets },
  profile: { findMany: mocks.profiles }, subDepartmentStatus: { findMany: mocks.statuses },
} }))
import { GET } from "./route"

const closedAt = new Date("2026-10-02T10:00:00Z")
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ profile: { id: "manager", role: "manager", activeTenantId: "tenant" }, error: null })
  mocks.groupBy.mockImplementation(async ({ by }) => by[0] === "subDepartmentId"
    ? [{ subDepartmentId: "dept", status: "Delivered", _count: { _all: 1 } }] : [])
  mocks.statuses.mockResolvedValue([{ subDepartmentId: "dept", label: "Delivered", category: "COMPLETE" }])
  mocks.profiles.mockResolvedValue([{ id: "alice", name: "Alice", avatarUrl: null }, { id: "bob", name: "Bob", avatarUrl: null }])
  mocks.tickets.mockImplementation(async ({ select }) => select.id ? [{
    id: "one", status: "Delivered", subDepartmentId: "dept", closedAt,
    assignee: { id: "bob", name: "Bob" }, assignees: [{ user: { id: "alice", name: "Alice" } }],
    intake: { apiKeyId: "portal-key", portalIdempotencyKey: null }, slaTimer: { source: "form" }, activityLogs: [],
  }] : [])
  mocks.sla.mockResolvedValue({ overall: "ON_TRACK" })
})

it("scopes ticket metrics to tenant, date, project, and all current assignees; evaluates SLA without writes", async () => {
  const response = await GET(new Request("http://localhost/api/reports/overview?from=2026-10-01&to=2026-10-12&personId=alice&projectId=project"))
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(mocks.tickets).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    tenantId: "tenant", subDepartmentId: { in: ["dept"] }, projectId: "project", deletedAt: null, isDraft: false,
    createdAt: { gte: expect.any(Date), lt: expect.any(Date) },
    OR: [{ assigneeId: "alice" }, { assignees: { some: { userId: "alice" } } }],
  }) }))
  expect(mocks.sla).toHaveBeenCalledWith("one", closedAt, { readOnly: true })
  expect(data.ticketSources).toEqual({ portal: 1, support: 0, manual: 0, mailbox: 0 })
  expect(data.personPerformance).toEqual([expect.objectContaining({ personId: "alice", assigned: 1, completed: 1, slaMet: 1 })])
  expect(data.resolved).toEqual([{ name: "Alice", count: 1 }])
})

it("ignores person filtering for roles without that permission", async () => {
  mocks.auth.mockResolvedValue({ profile: { id: "member", role: "member", activeTenantId: "tenant" }, error: null })
  const response = await GET(new Request("http://localhost/api/reports/overview?personId=alice"))
  expect((await response.json()).memberOptions).toEqual([])
  const query = mocks.tickets.mock.calls.find(([args]) => args.select.id)?.[0]
  expect(query.where).not.toHaveProperty("OR")
})

it("returns the authentication error without querying tickets", async () => {
  mocks.auth.mockResolvedValue({ error: new Response(null, { status: 401 }) })
  expect((await GET(new Request("http://localhost/api/reports/overview"))).status).toBe(401)
  expect(mocks.tickets).not.toHaveBeenCalled()
})
