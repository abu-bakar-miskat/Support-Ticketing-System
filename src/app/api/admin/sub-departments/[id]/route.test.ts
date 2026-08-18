import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth", () => ({
  requireAdminOrManager: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    subDepartment: { findUnique: vi.fn(), delete: vi.fn() },
    ticket: { count: vi.fn() },
    intakeFormConfig: { count: vi.fn() },
    profile: { updateMany: vi.fn() },
    routingRule: { updateMany: vi.fn() },
    intakeIssue: { updateMany: vi.fn() },
    project: { updateMany: vi.fn() },
    subDepartmentStatus: { deleteMany: vi.fn() },
    subDepartmentTicketCounter: { deleteMany: vi.fn() },
    subDepartmentGitHubStatusMap: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { DELETE } from "./route"

const mockRequire = vi.mocked(requireAdminOrManager)
const mockTicketCount = vi.mocked(prisma.ticket.count)
const mockIntakeFormCount = vi.mocked(prisma.intakeFormConfig.count)
const mockSubDepartmentDelete = vi.mocked(prisma.subDepartment.delete)
const mockTransaction = vi.mocked(prisma.$transaction)

const mockAdmin = {
  id: "00000000-0000-0000-0000-000000000001",
  role: "admin" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequire.mockResolvedValue({
    profile: mockAdmin,
    isAdmin: true,
    error: null,
  } as never)
  mockTicketCount.mockResolvedValue(0)
  mockIntakeFormCount.mockResolvedValue(0)
  mockSubDepartmentDelete.mockResolvedValue({ id: "team-1" } as never)
  // Resolve each Prisma promise in the interactive array form of $transaction
  mockTransaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops)
    return ops
  })
  // Make each updateMany/deleteMany resolve so Promise.all works
  vi.mocked(prisma.profile.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.routingRule.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.intakeIssue.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.subDepartmentStatus.deleteMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.subDepartmentTicketCounter.deleteMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.subDepartmentGitHubStatusMap.deleteMany).mockResolvedValue({ count: 0 } as never)
})

describe("DELETE /api/admin/sub-departments/[id]", () => {
  it("unlinks related rows then deletes the team (auto-created board FK)", async () => {
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "team-1" }),
    })

    expect(res.status).toBe(204)
    expect(mockTransaction).toHaveBeenCalled()
    expect(mockSubDepartmentDelete).toHaveBeenCalledWith({ where: { id: "team-1" } })
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: { subDepartmentId: "team-1" },
      data: { subDepartmentId: null },
    })
  })

  it("returns 409 when the team still has tickets", async () => {
    mockTicketCount.mockResolvedValue(3)

    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "team-1" }),
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/ticket/i)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("returns 409 when an intake form uses the team", async () => {
    mockIntakeFormCount.mockResolvedValue(1)

    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "team-1" }),
    })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/intake form/i)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("returns the auth error for non-admins", async () => {
    mockRequire.mockResolvedValue({
      profile: null,
      isAdmin: false,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as never)

    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "team-1" }),
    })
    expect(res.status).toBe(403)
  })
})
