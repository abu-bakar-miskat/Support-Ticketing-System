import { describe, it, expect, vi } from "vitest"

// auth.ts transitively imports server modules via getProfile; stub the heavy
// ones so the pure helpers under test load without a real DB/Supabase.
vi.mock("@/lib/profile", () => ({ getProfile: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: {} }))

import { getProfile } from "@/lib/profile"
import {
  departmentAdminScope,
  assertDepartmentAdmin,
  requireAuth,
  type AuthProfile,
} from "./auth"
import { canAdminDeptSettings } from "./dept-scope"

function profile(p: Partial<AuthProfile>): AuthProfile {
  return { role: "agent", departmentAdminIds: [], ...p } as AuthProfile
}

describe("requireAuth tenant context", () => {
  it("returns 404 for an inaccessible tenant encoded in the request URL", async () => {
    vi.mocked(getProfile).mockResolvedValue(
      profile({ tenantContextInvalid: true }) as never,
    )

    const result = await requireAuth()

    expect(result.profile).toBeNull()
    expect(result.error?.status).toBe(404)
  })
})

describe("departmentAdminScope", () => {
  it("tenant admin is unrestricted (null)", () => {
    expect(departmentAdminScope(profile({ role: "admin" }))).toBeNull()
  })

  it("department admin is scoped to exactly their admin departments", () => {
    const s = departmentAdminScope(profile({ role: "manager", departmentAdminIds: ["d1", "d2"] }))
    expect(s).not.toBeNull()
    expect([...(s as Set<string>)].sort()).toEqual(["d1", "d2"])
  })

  it("a plain manager (operational only) has an empty admin scope", () => {
    const s = departmentAdminScope(profile({ role: "manager", departmentAdminIds: [] }))
    expect([...(s as Set<string>)]).toEqual([])
  })
})

describe("canAdminDeptSettings", () => {
  it("allows tenant admins for any department", () => {
    expect(canAdminDeptSettings(profile({ role: "admin" }), "d1")).toBe(true)
  })

  it("allows department-scoped admins for their departments", () => {
    expect(
      canAdminDeptSettings(profile({ role: "manager", departmentAdminIds: ["d1"] }), "d1"),
    ).toBe(true)
  })

  it("denies department-scoped admins outside their departments", () => {
    expect(
      canAdminDeptSettings(profile({ role: "manager", departmentAdminIds: ["d1"] }), "d2"),
    ).toBe(false)
  })

  it("denies plain managers", () => {
    expect(
      canAdminDeptSettings(profile({ role: "manager", departmentAdminIds: [] }), "d1"),
    ).toBe(false)
  })
})

describe("assertDepartmentAdmin", () => {
  it("400s when no departmentId is provided", () => {
    expect(assertDepartmentAdmin(profile({ role: "admin" }), null)?.status).toBe(400)
  })

  it("lets a tenant admin through for any department", () => {
    expect(assertDepartmentAdmin(profile({ role: "admin" }), "d9")).toBeNull()
  })

  it("lets a department admin through for a department they administer", () => {
    expect(
      assertDepartmentAdmin(profile({ role: "manager", departmentAdminIds: ["d1"] }), "d1"),
    ).toBeNull()
  })

  it("403s a department admin outside their administered departments", () => {
    expect(
      assertDepartmentAdmin(profile({ role: "manager", departmentAdminIds: ["d1"] }), "d2")?.status,
    ).toBe(403)
  })

  it("403s a plain manager (no admin-only settings power)", () => {
    expect(assertDepartmentAdmin(profile({ role: "manager" }), "d1")?.status).toBe(403)
  })
})
