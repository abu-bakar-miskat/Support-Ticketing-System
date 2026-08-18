import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/role-assignment", () => ({ resolveUserScope: vi.fn() }))
vi.mock("@/lib/dept-scope", () => ({ getProfileDeptScope: vi.fn() }))

import { resolveUserScope } from "@/lib/role-assignment"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { resolveReportScope } from "./report-scope"

const mockResolveUserScope = vi.mocked(resolveUserScope)
const mockGetProfileDeptScope = vi.mocked(getProfileDeptScope)

const baseUserScope = {
  isPlatformAdmin: false,
  tenantIds: [],
  tenantAdminIds: [],
  departmentIds: [],
  departmentAdminIds: [],
  subDepartmentIds: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveReportScope", () => {
  it("gives a platform admin cross-department scope for their active tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, isPlatformAdmin: true })
    const result = await resolveReportScope({ id: "u1", role: "admin", activeTenantId: "t1" })
    expect(result).toEqual({ kind: "cross_department", tenantId: "t1" })
  })

  it("gives none to a platform admin with no active tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, isPlatformAdmin: true })
    const result = await resolveReportScope({ id: "u1", role: "admin", activeTenantId: null })
    expect(result).toEqual({ kind: "none" })
  })

  it("gives a tenant-admin (Project Admin) cross-department scope", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, tenantAdminIds: ["t1"] })
    const result = await resolveReportScope({ id: "u1", role: "admin", activeTenantId: "t1" })
    expect(result).toEqual({ kind: "cross_department", tenantId: "t1" })
  })

  it("does not grant cross-department scope for tenant-admin of a DIFFERENT tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, tenantAdminIds: ["t2"] })
    mockGetProfileDeptScope.mockResolvedValue({ activeDeptId: "d1", teamIds: ["team1"], allowedDeptIds: ["d1"] })
    const result = await resolveReportScope({ id: "u1", role: "manager", activeTenantId: "t1" })
    expect(result).toEqual({ kind: "department", teamIds: ["team1"] })
  })

  it("falls back to department scope for a regular staff/manager", async () => {
    mockResolveUserScope.mockResolvedValue(baseUserScope)
    mockGetProfileDeptScope.mockResolvedValue({ activeDeptId: "d1", teamIds: ["team1", "team2"], allowedDeptIds: ["d1"] })
    const result = await resolveReportScope({ id: "u1", role: "staff", activeTenantId: "t1" })
    expect(result).toEqual({ kind: "department", teamIds: ["team1", "team2"] })
  })

  it("gives none when there is no dept scope at all", async () => {
    mockResolveUserScope.mockResolvedValue(baseUserScope)
    mockGetProfileDeptScope.mockResolvedValue(null)
    const result = await resolveReportScope({ id: "u1", role: "staff", activeTenantId: "t1" })
    expect(result).toEqual({ kind: "none" })
  })
})
