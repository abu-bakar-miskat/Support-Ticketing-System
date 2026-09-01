import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    departmentManager: { findUnique: vi.fn(), deleteMany: vi.fn() },
    department: { findUnique: vi.fn() },
  },
}))

import { DELETE } from "./route"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"

const mockGetProfile = vi.mocked(getProfile)
const mockTarget = vi.mocked(prisma.departmentManager.findUnique)
const mockDeleteMany = vi.mocked(prisma.departmentManager.deleteMany)

const DEPT = "dept1"
const manager = { id: "u-mgr", role: "manager" as const, managedDepartmentIds: [DEPT], departmentAdminIds: [] as string[] }
const deptAdmin = { id: "u-dadmin", role: "manager" as const, managedDepartmentIds: [DEPT], departmentAdminIds: [DEPT] }
const tenantAdmin = { id: "u-admin", role: "admin" as const, managedDepartmentIds: [] as string[], departmentAdminIds: [] as string[] }

function call(target = "target") {
  return DELETE({} as never, { params: Promise.resolve({ id: DEPT, userId: target }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.department.findUnique).mockResolvedValue({ tenantId: "t1" } as never)
  mockDeleteMany.mockResolvedValue({ count: 1 } as never)
})

describe("DELETE /api/admin/departments/[id]/managers/[userId] — admin-removal guard", () => {
  it("403s a plain manager trying to remove an admin", async () => {
    mockGetProfile.mockResolvedValue(manager as never)
    mockTarget.mockResolvedValue({ role: "admin" } as never)
    const res = await call()
    expect(res.status).toBe(403)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it("lets a plain manager remove another manager (204)", async () => {
    mockGetProfile.mockResolvedValue(manager as never)
    mockTarget.mockResolvedValue({ role: "manager" } as never)
    const res = await call()
    expect(res.status).toBe(204)
    expect(mockDeleteMany).toHaveBeenCalled()
  })

  it("lets a department admin remove an admin (204)", async () => {
    mockGetProfile.mockResolvedValue(deptAdmin as never)
    mockTarget.mockResolvedValue({ role: "admin" } as never)
    const res = await call()
    expect(res.status).toBe(204)
  })

  it("lets a tenant admin remove an admin (204)", async () => {
    mockGetProfile.mockResolvedValue(tenantAdmin as never)
    mockTarget.mockResolvedValue({ role: "admin" } as never)
    const res = await call()
    expect(res.status).toBe(204)
  })
})
