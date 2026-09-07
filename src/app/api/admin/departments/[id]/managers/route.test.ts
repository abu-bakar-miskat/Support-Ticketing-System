import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    departmentManager: { findUnique: vi.fn(), upsert: vi.fn() },
    department: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { POST } from "./route"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockFindExisting = vi.mocked(prisma.departmentManager.findUnique)
const mockUpsertManager = vi.mocked(prisma.departmentManager.upsert)
const mockDept = vi.mocked(prisma.department.findUnique)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)

const DEPT = "dept1"

const manager = {
  id: "u-mgr",
  role: "manager" as const,
  managedDepartmentIds: [DEPT],
  departmentAdminIds: [] as string[],
}
const tenantAdmin = {
  id: "u-admin",
  role: "admin" as const,
  managedDepartmentIds: [] as string[],
  departmentAdminIds: [] as string[],
}
const deptAdmin = {
  id: "u-dadmin",
  role: "manager" as const,
  managedDepartmentIds: [DEPT],
  departmentAdminIds: [DEPT],
}

function req(body: unknown) {
  return {
    request: new Request(`http://localhost/api/admin/departments/${DEPT}/managers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    ctx: { params: Promise.resolve({ id: DEPT }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDept.mockResolvedValue({ id: DEPT, tenantId: "t1" } as never)
  mockUpsertManager.mockResolvedValue({ id: "dm1", userId: "target", user: {} } as never)
  mockProfileFind.mockResolvedValue({ role: "agent" } as never)
})

describe("POST /api/admin/departments/[id]/managers — admin-grant guard", () => {
  it("403s a plain manager trying to grant admin", async () => {
    mockGetProfile.mockResolvedValue(manager as never)
    mockFindExisting.mockResolvedValue(null as never)
    const { request, ctx } = req({ userId: "target", role: "admin" })
    const res = await POST(request, ctx)
    expect(res.status).toBe(403)
    expect(mockUpsertManager).not.toHaveBeenCalled()
  })

  it("403s a plain manager trying to downgrade an existing admin", async () => {
    mockGetProfile.mockResolvedValue(manager as never)
    mockFindExisting.mockResolvedValue({ role: "admin" } as never)
    const { request, ctx } = req({ userId: "target" }) // omitted role → manager
    const res = await POST(request, ctx)
    expect(res.status).toBe(403)
    expect(mockUpsertManager).not.toHaveBeenCalled()
  })

  it("lets a tenant admin grant admin (201) with role persisted", async () => {
    mockGetProfile.mockResolvedValue(tenantAdmin as never)
    mockFindExisting.mockResolvedValue(null as never)
    const { request, ctx } = req({ userId: "target", role: "admin" })
    const res = await POST(request, ctx)
    expect(res.status).toBe(201)
    expect(mockUpsertManager).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "admin" }),
        update: { role: "admin" },
      }),
    )
  })

  it("lets a department admin grant admin in their department (201)", async () => {
    mockGetProfile.mockResolvedValue(deptAdmin as never)
    mockFindExisting.mockResolvedValue(null as never)
    const { request, ctx } = req({ userId: "target", role: "admin" })
    const res = await POST(request, ctx)
    expect(res.status).toBe(201)
  })

  it("lets a plain manager add another manager (201)", async () => {
    mockGetProfile.mockResolvedValue(manager as never)
    mockFindExisting.mockResolvedValue(null as never)
    const { request, ctx } = req({ userId: "target" })
    const res = await POST(request, ctx)
    expect(res.status).toBe(201)
    expect(mockUpsertManager).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "manager" }) }),
    )
  })
})
