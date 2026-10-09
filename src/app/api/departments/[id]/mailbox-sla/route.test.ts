import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  department: { findUnique: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/db", () => ({ prisma: { department: m.department } }))
vi.mock("@/lib/auth", () => ({ requireAuth: m.auth }))
vi.mock("@/lib/dept-scope", () => ({
  departmentIdInScope: vi.fn().mockResolvedValue(true),
  canAdminDeptSettings: (p: { role: string; departmentAdminIds?: string[] }, id: string) =>
    p.role === "admin" || (p.departmentAdminIds ?? []).includes(id),
}))
import { PATCH } from "./route"

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
