import { describe, it, expect, vi } from "vitest"

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/support-project", () => ({ isNativeDeptMemberOrManager: () => false }))
vi.mock("@/lib/tenant-scope", () => ({
  resolveActiveTenantId: vi.fn(),
  departmentInTenant: vi.fn(),
}))

import { buildPeopleMembershipWhere } from "./dept-scope"

describe("buildPeopleMembershipWhere — tenant bound", () => {
  it("bounds an admin's global (no active dept) people list to the active tenant", () => {
    const where = buildPeopleMembershipWhere(
      { role: "admin", activeTenantId: "tenant-A" },
      null,
    )
    expect(where).toEqual({ isActive: true, subDepartment: { tenantId: "tenant-A" } })
  })

  it("prefers the active dept's teams when a dept scope is present", () => {
    const where = buildPeopleMembershipWhere(
      { role: "admin", activeTenantId: "tenant-A" },
      { activeDeptId: "d1", subDepartmentIds: ["t1", "t2"], allowedDeptIds: ["d1"] },
    )
    expect(where).toEqual({ isActive: true, subDepartmentId: { in: ["t1", "t2"] } })
  })

  it("falls back to unbounded only when there is no tenant context at all", () => {
    const where = buildPeopleMembershipWhere({ role: "admin" }, null)
    expect(where).toEqual({ isActive: true })
  })
})
