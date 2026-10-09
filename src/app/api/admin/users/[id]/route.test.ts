import { describe, it, expect, vi, beforeEach } from "vitest"
import { PATCH } from "./route"

const mockAdmin = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@pen.com",
  name: "Admin",
  avatarUrl: null,
  role: "admin" as const,
  activeTenantId: "tenant-1",
  subDepartmentId: null,
  subDepartmentIds: [],
  memberships: [],
  timezone: null,
  notificationPrefs: null,
  createdAt: new Date(),
}

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastForceLogout: vi.fn() }))
vi.mock("@/lib/role-management", () => ({
  buildRoleChangeActor: vi.fn((profile) => profile),
  changeRoles: vi.fn(),
  expectedBeforeForChanges: vi.fn(),
  loadUserRoleChanges: vi.fn(),
  planLegacyDepartmentRoleUpdate: vi.fn(),
  roleChangeHttpStatus: vi.fn(() => 400),
  RoleChangeError: class RoleChangeError extends Error {},
}))
vi.mock("@/lib/role-assignment", () => ({
  syncUserRoleAssignments: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    departmentManager: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    departmentMember: { findFirst: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    subDepartmentMembership: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    department: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    tenantMembership: { findFirst: vi.fn() },
    $transaction: vi.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg({
      profile: { update: vi.fn() },
      subDepartmentMembership: { updateMany: vi.fn(), upsert: vi.fn() },
    }))),
  },
}))

import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { changeRoles, loadUserRoleChanges, planLegacyDepartmentRoleUpdate } from "@/lib/role-management"

const mockRequireAuth = vi.mocked(requireAuth)
const mockFindUnique = vi.mocked(prisma.profile.findUnique)
const mockUpdate = vi.mocked(prisma.profile.update)
const mockFindUniqueOrThrow = vi.mocked(prisma.profile.findUniqueOrThrow)
const mockChangeRoles = vi.mocked(changeRoles)
const mockLoadUserRoleChanges = vi.mocked(loadUserRoleChanges)
const mockPlanLegacy = vi.mocked(planLegacyDepartmentRoleUpdate)

function makeRequest(id: string, body: unknown) {
  return {
    request: new Request(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ profile: mockAdmin as never, error: null })
  // Target user is a member of the caller's active tenant (tenant-isolation guard).
  vi.mocked(prisma.tenantMembership.findFirst).mockResolvedValue({ userId: "target" } as never)
  mockFindUnique.mockResolvedValue({ subDepartmentId: null, location: null, timezone: null, isActive: true } as never)
  mockFindUniqueOrThrow.mockResolvedValue(mockAdmin as never)
  vi.mocked(prisma.$transaction).mockImplementation((arg: unknown) => {
    if (typeof arg === "function") return arg({ profile: { update: mockUpdate } })
    return arg
  })
  mockLoadUserRoleChanges.mockResolvedValue([])
  mockPlanLegacy.mockReturnValue([
    { scopeType: "DEPARTMENT", scopeId: "dept-1", role: "manager" },
  ])
})

describe("PATCH /api/admin/users/[id]", () => {
  it("routes role changes through the scoped role-management service", async () => {
    const targetId = "00000000-0000-0000-0000-000000000002"
    mockFindUniqueOrThrow.mockResolvedValue({ ...mockAdmin, id: targetId } as never)

    const { request, params } = makeRequest(targetId, {
      role: "manager",
      departmentId: "dept-1",
    })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(200)
    expect(mockChangeRoles).toHaveBeenCalledOnce()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("returns 200 when assigning a subDepartment", async () => {
    const targetId = "00000000-0000-0000-0000-000000000002"
    mockUpdate.mockResolvedValue({ ...mockAdmin, id: targetId, subDepartmentId: "subDepartment1" } as never)
    vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue({ departmentId: "dept-1" } as never)

    const { request, params } = makeRequest(targetId, { subDepartmentId: "subDepartment1" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(200)
  })

  it("returns 400 for an invalid role value", async () => {
    const { request, params } = makeRequest("some-id", { role: "superuser", departmentId: "dept-1" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(400)
  })

  it("returns 400 when body has no recognised fields", async () => {
    const { request, params } = makeRequest("some-id", { unknown: true })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(400)
  })

  it("saves a department for an agent who has no sub-department yet", async () => {
    const targetId = "00000000-0000-0000-0000-000000000002"
    vi.mocked(prisma.department.findUnique).mockResolvedValue({ id: "dept-1", tenantId: "tenant-1" } as never)
    vi.mocked(prisma.tenantMembership.findFirst).mockResolvedValue({ userId: targetId, role: "agent" } as never)
    vi.mocked(prisma.departmentManager.findMany).mockResolvedValue([] as never)
    mockUpdate.mockResolvedValue({ ...mockAdmin, id: targetId, subDepartmentId: null } as never)

    const { request, params } = makeRequest(targetId, { departmentId: "dept-1" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(200)
    expect(prisma.departmentMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { departmentId_userId: { departmentId: "dept-1", userId: targetId } },
      create: expect.objectContaining({
        departmentId: "dept-1",
        userId: targetId,
        addedBy: mockAdmin.id,
      }),
    }))
    expect(prisma.departmentManager.upsert).not.toHaveBeenCalled()
  })

  it("returns 403 when caller is not admin or manager", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: { ...mockAdmin, role: "agent" } as never,
      error: null,
    })

    const { request, params } = makeRequest("some-id", { role: "admin", departmentId: "dept-1" })
    const res = await PATCH(request, { params })

    expect(res.status).toBe(403)
  })
})
