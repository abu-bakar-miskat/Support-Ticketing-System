import { describe, it, expect, vi, beforeEach } from "vitest"

const cookieStore = { get: vi.fn() }
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { count: vi.fn(), findFirst: vi.fn() },
    department: { count: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
  },
}))

import { hasTenantAccess, resolveActiveTenantId } from "./tenant-scope"
import { prisma } from "@/lib/db"

const mockTenantCount = vi.mocked(prisma.tenant.count)
const mockTenantFindFirst = vi.mocked(prisma.tenant.findFirst)

function setCookie(value: string | null) {
  cookieStore.get.mockReturnValue(value ? { value } : undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  setCookie(null)
})

describe("hasTenantAccess", () => {
  it("allows a member of the tenant", () => {
    expect(hasTenantAccess({ tenantIds: ["t1", "t2"] }, "t1")).toBe(true)
  })

  it("rejects a non-member", () => {
    expect(hasTenantAccess({ tenantIds: ["t1"] }, "t2")).toBe(false)
  })

  it("allows a super-admin into any tenant, even without membership", () => {
    expect(hasTenantAccess({ isSuperAdmin: true, tenantIds: [] }, "anything")).toBe(true)
  })
})

describe("resolveActiveTenantId", () => {
  it("returns the cookie tenant when the member belongs to it", async () => {
    setCookie("t2")
    const result = await resolveActiveTenantId({ tenantIds: ["t1", "t2"] })
    expect(result).toBe("t2")
    // Member path must not hit the DB.
    expect(mockTenantCount).not.toHaveBeenCalled()
  })

  it("falls back to the first membership when the cookie points to a tenant they don't belong to", async () => {
    setCookie("t9")
    const result = await resolveActiveTenantId({ tenantIds: ["t1", "t2"] })
    expect(result).toBe("t1")
  })

  it("returns null for a member with no tenants", async () => {
    setCookie(null)
    const result = await resolveActiveTenantId({ tenantIds: [] })
    expect(result).toBeNull()
  })

  it("lets a super-admin keep a cookie tenant they don't belong to, when it exists", async () => {
    setCookie("t-other")
    mockTenantCount.mockResolvedValue(1)
    const result = await resolveActiveTenantId({ isSuperAdmin: true, tenantIds: [] })
    expect(result).toBe("t-other")
  })

  it("falls back to the oldest tenant for a super-admin whose cookie tenant no longer exists", async () => {
    setCookie("t-deleted")
    mockTenantCount.mockResolvedValue(0)
    mockTenantFindFirst.mockResolvedValue({ id: "t-oldest" } as never)
    const result = await resolveActiveTenantId({ isSuperAdmin: true, tenantIds: [] })
    expect(result).toBe("t-oldest")
  })
})
