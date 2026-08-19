import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/role-assignment", () => ({ resolveUserScope: vi.fn() }))
vi.mock("@/lib/db", () => ({
  prisma: { auditEvent: { findMany: vi.fn() }, profile: { findMany: vi.fn() } },
}))

import { requireAuth } from "@/lib/auth"
import { resolveUserScope } from "@/lib/role-assignment"
import { prisma } from "@/lib/db"
import { GET } from "./route"

const mockRequireAuth = vi.mocked(requireAuth)
const mockResolveUserScope = vi.mocked(resolveUserScope)
const mockFindMany = vi.mocked(prisma.auditEvent.findMany)
const mockProfileFindMany = vi.mocked(prisma.profile.findMany)

const baseUserScope = {
  isPlatformAdmin: false,
  tenantIds: [],
  tenantAdminIds: [],
  departmentIds: [],
  departmentAdminIds: [],
  subDepartmentIds: [],
}

function makeRequest(qs: string) {
  return new NextRequest(`http://localhost/api/admin/audit-events?${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ profile: { id: "u1" }, error: null } as never)
  mockProfileFindMany.mockResolvedValue([])
})

describe("GET /api/admin/audit-events", () => {
  it("requires tenantId", async () => {
    mockResolveUserScope.mockResolvedValue(baseUserScope)
    const res = await GET(makeRequest(""))
    expect(res.status).toBe(400)
  })

  it("allows a platform admin to view any tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, isPlatformAdmin: true })
    mockFindMany.mockResolvedValue([])
    const res = await GET(makeRequest("tenantId=t1"))
    expect(res.status).toBe(200)
  })

  it("allows a tenant-admin (Project Admin) to view their own tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, tenantAdminIds: ["t1"] })
    mockFindMany.mockResolvedValue([])
    const res = await GET(makeRequest("tenantId=t1"))
    expect(res.status).toBe(200)
  })

  it("forbids a tenant-admin from viewing a DIFFERENT tenant", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, tenantAdminIds: ["t2"] })
    const res = await GET(makeRequest("tenantId=t1"))
    expect(res.status).toBe(403)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("forbids a regular user with no admin scope", async () => {
    mockResolveUserScope.mockResolvedValue(baseUserScope)
    const res = await GET(makeRequest("tenantId=t1"))
    expect(res.status).toBe(403)
  })

  it("filters by targetType when given", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, isPlatformAdmin: true })
    mockFindMany.mockResolvedValue([])
    await GET(makeRequest("tenantId=t1&targetType=FeatureFlag"))
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", targetType: "FeatureFlag" } }),
    )
  })

  it("caps take at the max page size", async () => {
    mockResolveUserScope.mockResolvedValue({ ...baseUserScope, isPlatformAdmin: true })
    mockFindMany.mockResolvedValue([])
    await GET(makeRequest("tenantId=t1&take=999"))
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))
  })
})
