import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  department: { findUnique: vi.fn(), update: vi.fn() },
  mailbox: { findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/db", () => ({ prisma: { department: m.department, mailboxConnection: m.mailbox } }))
vi.mock("@/lib/auth", () => ({ requireAuth: m.auth }))
vi.mock("@/lib/dept-scope", () => ({
  departmentIdInScope: vi.fn().mockResolvedValue(true),
  canAdminDeptSettings: (p: { role: string; departmentAdminIds?: string[] }, id: string) =>
    p.role === "admin" || (p.departmentAdminIds ?? []).includes(id),
}))
import { GET, PATCH } from "./route"

const manager = { id: "u-1", role: "manager", departmentAdminIds: [], managedDepartmentIds: ["dept-1"] }
const agent = { id: "u-2", role: "agent", departmentAdminIds: [], managedDepartmentIds: [] }
const params = { params: Promise.resolve({ id: "dept-1" }) }
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://x/api/departments/dept-1/mailbox-sla", { method: "PATCH", body: JSON.stringify(body) }), params)

beforeEach(() => {
  vi.clearAllMocks()
  m.department.findUnique.mockResolvedValue({ id: "dept-1" })
  m.department.update.mockImplementation(async ({ data }) => data)
})

describe("PATCH /api/departments/:id/mailbox-sla", () => {
  it("lets a department manager set both targets", async () => {
    m.auth.mockResolvedValue({ profile: manager })
    const res = await patch({ firstResponseMins: 30, resolutionMins: 240 })
    expect(res.status).toBe(200)
    expect(m.department.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dept-1" },
      data: { mailboxFirstResponseMins: 30, mailboxResolutionMins: 240 },
    }))
  })

  it("clears the SLA when both targets are null", async () => {
    m.auth.mockResolvedValue({ profile: manager })
    const res = await patch({ firstResponseMins: null, resolutionMins: null })
    expect(res.status).toBe(200)
    expect(m.department.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { mailboxFirstResponseMins: null, mailboxResolutionMins: null },
    }))
  })

  it.each([
    { firstResponseMins: 30 },
    { firstResponseMins: 0, resolutionMins: 60 },
    { firstResponseMins: 1.5, resolutionMins: 60 },
  ])("rejects a partial or invalid pair: %j", async (body) => {
    m.auth.mockResolvedValue({ profile: manager })
    expect((await patch(body)).status).toBe(400)
    expect(m.department.update).not.toHaveBeenCalled()
  })

  it("forbids agents", async () => {
    m.auth.mockResolvedValue({ profile: agent })
    expect((await patch({ firstResponseMins: 30, resolutionMins: 240 })).status).toBe(403)
    expect(m.department.update).not.toHaveBeenCalled()
  })
})


it("updates only a mailbox belonging to the authorized department", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  m.mailbox.findFirst.mockResolvedValueOnce({ id: "mailbox-1" })
  expect((await patch({ mailboxConnectionId: "mailbox-1", firstResponseMins: 10, resolutionMins: 60 })).status).toBe(200)
  expect(m.mailbox.findFirst).toHaveBeenCalledWith({ where: { id: "mailbox-1", departmentId: "dept-1" }, select: { id: true } })
  expect(m.mailbox.update).toHaveBeenCalledWith({ where: { id: "mailbox-1" }, data: { slaFirstResponseMins: 10, slaResolutionMins: 60 } })
  expect(m.department.update).not.toHaveBeenCalled()
})
it("rejects mailbox overrides for another department", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  m.mailbox.findFirst.mockResolvedValueOnce(null)
  expect((await patch({ mailboxConnectionId: "other", firstResponseMins: 10, resolutionMins: 60 })).status).toBe(404)
  expect(m.mailbox.update).not.toHaveBeenCalled()
})
it("stores active status names without erasing existing SLA settings", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  m.department.findUnique.mockResolvedValueOnce({ id: "dept-1", slaConfig: { atRiskPct: 75, pauseOutsideHours: false }, subDepartments: [{ statuses: [{ label: "Investigating", isComplete: false }] }] })
  await patch({ firstResponseMins: 30, resolutionMins: 240, activeStatuses: ["Investigating"] })
  expect(m.department.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slaConfig: { atRiskPct: 75, pauseOutsideHours: false, mailboxActiveStatuses: ["Investigating"] } }) }))
})
it("rejects an empty qualifying active-status list", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  expect((await patch({ firstResponseMins: 30, resolutionMins: 240, activeStatuses: [] })).status).toBe(400)
})

it("returns current department workflow options, excluding completion statuses and duplicates", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  m.department.findUnique.mockResolvedValueOnce({ mailboxFirstResponseMins: 30, mailboxResolutionMins: 240, subDepartments: [
    { statuses: [{ label: "In Progress", isComplete: false }, { label: "Investigating", isComplete: false }, { label: "Resolved", isComplete: true }] },
    { statuses: [{ label: "Investigating", isComplete: false }] },
  ] })
  const res = await GET(new NextRequest("http://x/api/departments/dept-1/mailbox-sla"), params)
  expect(await res.json()).toMatchObject({ availableStatuses: ["In Progress", "Investigating"], activeStatuses: ["In Progress"] })
})
it("rejects arbitrary status names rather than storing free text", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  expect((await patch({ firstResponseMins: 30, resolutionMins: 240, activeStatuses: ["Invented"] })).status).toBe(400)
  expect(m.department.update).not.toHaveBeenCalled()
})
it("maps the default active status to its current workflow spelling", async () => {
  m.auth.mockResolvedValue({ profile: manager })
  const res = await GET(new NextRequest("http://x/api/departments/dept-1/mailbox-sla"), params)
  expect(await res.json()).toMatchObject({ activeStatuses: ["IN PROGRESS"] })
})
