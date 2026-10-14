import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn(), updateMany: vi.fn(),
  canManage: vi.fn(), after: vi.fn(),
}))
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }))
vi.mock("@/lib/timer-autostop", () => ({ stopRunningTimersOnStatusChange: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn().mockResolvedValue({ profile: { id: "admin" } }) }))
vi.mock("@/lib/sub-department-manage", () => ({ canManageSubDepartment: mocks.canManage }))
vi.mock("@/lib/dept-scope", () => ({ canReadSubDepartmentData: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/db", () => {
  const tx = { subDepartmentStatus: { findFirst: mocks.findFirst, create: mocks.create, findMany: mocks.findMany, update: mocks.update }, ticket: { count: mocks.count, updateMany: mocks.updateMany }, $executeRaw: vi.fn() }
  return { prisma: { ...tx, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } }
})
import { POST } from "./route"
import { PATCH } from "./[statusId]/route"

const request = (body: unknown) => new Request("http://localhost/api/statuses", { method: "POST", body: JSON.stringify(body) }) as never
const params = { params: Promise.resolve({ id: "team", statusId: "status" }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.canManage.mockResolvedValue(true)
  mocks.findMany.mockResolvedValue([{ order: 2 }])
  mocks.findFirst.mockResolvedValue({ id: "status", label: "Review", category: "IN_PROGRESS", isComplete: false })
  mocks.count.mockResolvedValue(0)
  mocks.update.mockImplementation(async (args) => ({ id: "status", label: "Review", ...args.data, isComplete: args.data.category === "COMPLETE" }))
  mocks.create.mockImplementation(async (args) => ({ ...args.data, isComplete: args.data.category === "COMPLETE" }))
})

describe("workflow category API", () => {
  it("requires one of the four fixed categories", async () => {
    expect((await POST(request({ label: "Test", category: "TESTING" }), params)).status).toBe(400)
    expect((await POST(request({ label: "Test" }), params)).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("creates a custom completion status with a matching compatibility flag", async () => {
    const res = await POST(request({ label: "Live", category: "COMPLETE" }), params)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ label: "Live", category: "COMPLETE", isComplete: true, order: 3 })
  })

  it("does not silently complete tickets when reclassifying a populated status", async () => {
    mocks.count.mockResolvedValue(3)
    expect((await PATCH(request({ category: "COMPLETE" }), params)).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it("moves an empty status into Complete and forbids contradictory flags", async () => {
    const res = await PATCH(request({ category: "COMPLETE" }), params)
    expect(await res.json()).toMatchObject({ category: "COMPLETE", isComplete: true })
    expect((await PATCH(request({ category: "BLOCKED", isComplete: true }), params)).status).toBe(400)
  })

  it("rejects the retired completion setting without a category", async () => {
    expect((await PATCH(request({ isComplete: true }), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("keeps ticket status labels associated with the workflow after a rename", async () => {
    expect((await PATCH(request({ label: "Testing" }), params)).status).toBe(200)
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { subDepartmentId: "team", status: "Review" }, data: { status: "Testing" } })
  })

  it("queues timer reconciliation when active work is reclassified as blocked", async () => {
    expect((await PATCH(request({ category: "BLOCKED" }), params)).status).toBe(200)
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it("requires workflow-management access", async () => {
    mocks.canManage.mockResolvedValue(false)
    expect((await POST(request({ label: "Done", category: "COMPLETE" }), params)).status).toBe(403)
    expect((await PATCH(request({ category: "TODO" }), params)).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
