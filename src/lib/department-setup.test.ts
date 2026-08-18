import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn(), update: vi.fn() },
    departmentManager: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import {
  isDepartmentOperational,
  assertDepartmentOperational,
  completeDepartmentSetup,
  needsWalkthroughOverview,
  dismissWalkthroughOverview,
} from "./department-setup"

const mockDeptFind = vi.mocked(prisma.department.findUnique)
const mockDeptUpdate = vi.mocked(prisma.department.update)
const mockManagerFind = vi.mocked(prisma.departmentManager.findUnique)
const mockManagerUpdateMany = vi.mocked(prisma.departmentManager.updateMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isDepartmentOperational / assertDepartmentOperational", () => {
  it("is operational once setupCompletedAt is set", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: new Date() } as never)
    expect(await isDepartmentOperational("d1")).toBe(true)
    expect(await assertDepartmentOperational("d1")).toEqual({ ok: true })
  })

  it("blocks a pending department (setupCompletedAt null)", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: null } as never)
    expect(await isDepartmentOperational("d1")).toBe(false)
    const result = await assertDepartmentOperational("d1")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/setup/i)
  })

  it("blocks when the department doesn't exist", async () => {
    mockDeptFind.mockResolvedValue(null as never)
    expect(await isDepartmentOperational("gone")).toBe(false)
  })
})

describe("completeDepartmentSetup", () => {
  it("sets setupCompletedAt to now", async () => {
    mockDeptUpdate.mockResolvedValue({} as never)
    await completeDepartmentSetup("d1")
    expect(mockDeptUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { setupCompletedAt: expect.any(Date) } })
  })
})

describe("needsWalkthroughOverview — DS-09", () => {
  it("is true for a new manager of an already-active department", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: new Date() } as never)
    mockManagerFind.mockResolvedValue({ walkthroughDismissedAt: null } as never)
    expect(await needsWalkthroughOverview("u1", "d1")).toBe(true)
  })

  it("is false once the manager has dismissed it", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: new Date() } as never)
    mockManagerFind.mockResolvedValue({ walkthroughDismissedAt: new Date() } as never)
    expect(await needsWalkthroughOverview("u1", "d1")).toBe(false)
  })

  it("is false for a department still pending setup (that's DS-08's hard block, not this)", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: null } as never)
    mockManagerFind.mockResolvedValue({ walkthroughDismissedAt: null } as never)
    expect(await needsWalkthroughOverview("u1", "d1")).toBe(false)
  })

  it("is false when the user isn't a manager of this department", async () => {
    mockDeptFind.mockResolvedValue({ setupCompletedAt: new Date() } as never)
    mockManagerFind.mockResolvedValue(null as never)
    expect(await needsWalkthroughOverview("u1", "d1")).toBe(false)
  })
})

describe("dismissWalkthroughOverview", () => {
  it("sets walkthroughDismissedAt for this manager", async () => {
    mockManagerUpdateMany.mockResolvedValue({ count: 1 } as never)
    await dismissWalkthroughOverview("u1", "d1")
    expect(mockManagerUpdateMany).toHaveBeenCalledWith({
      where: { departmentId: "d1", userId: "u1" },
      data: { walkthroughDismissedAt: expect.any(Date) },
    })
  })
})
