import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { subDepartment: { findMany: vi.fn() } } }))
vi.mock("@/lib/dept-scope", () => ({ getProfileDeptScope: vi.fn() }))

import { analyticsTicketWhere } from "./analytics-scope"

describe("analyticsTicketWhere", () => {
  it("scopes a department view to that department inside the tenant", () => {
    expect(analyticsTicketWhere("tenant-1", ["sub-a", "sub-b"])).toEqual({
      tenantId: "tenant-1",
      subDepartmentId: { in: ["sub-a", "sub-b"] },
    })
  })

  it("scopes a tenant-wide view to the tenant and not a single department", () => {
    expect(analyticsTicketWhere("tenant-1", null)).toEqual({ tenantId: "tenant-1" })
  })

  it("matches nothing when a department filter has no sub-departments", () => {
    expect(analyticsTicketWhere("tenant-1", [])).toEqual({
      tenantId: "tenant-1",
      subDepartmentId: { in: ["__none__"] },
    })
  })

  it("matches nothing without a tenant", () => {
    expect(analyticsTicketWhere(null, null)).toEqual({ id: "__none__" })
  })
})
