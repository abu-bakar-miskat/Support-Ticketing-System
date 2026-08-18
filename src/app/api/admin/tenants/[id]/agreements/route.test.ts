import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: { tenant: { findUnique: vi.fn() } } }))
vi.mock("@/lib/agreements", () => ({
  listAgreementsForTenant: vi.fn(),
  createAgreement: vi.fn(),
}))

import { requireSuperAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { listAgreementsForTenant, createAgreement } from "@/lib/agreements"
import { GET, POST } from "./route"

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockTenantFindUnique = vi.mocked(prisma.tenant.findUnique)
const mockList = vi.mocked(listAgreementsForTenant)
const mockCreate = vi.mocked(createAgreement)

function params(id = "t1") {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ profile: { id: "sa1" }, error: null } as never)
})

describe("GET /api/admin/tenants/:id/agreements", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await GET(new Request("http://localhost"), params())
    expect(res.status).toBe(403)
  })

  it("404s for an unknown tenant", async () => {
    mockTenantFindUnique.mockResolvedValue(null)
    const res = await GET(new Request("http://localhost"), params())
    expect(res.status).toBe(404)
  })

  it("returns the tenant's agreement terms", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1" } as never)
    mockList.mockResolvedValue([{ id: "a1" }] as never)
    const res = await GET(new Request("http://localhost"), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "a1" }])
  })
})

describe("POST /api/admin/tenants/:id/agreements — SA-02", () => {
  function req(body: unknown) {
    return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) })
  }

  beforeEach(() => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1" } as never)
  })

  it("404s for an unknown tenant", async () => {
    mockTenantFindUnique.mockResolvedValue(null)
    const res = await POST(req({ startDate: "2026-01-01", endDate: "2026-12-31" }), params())
    expect(res.status).toBe(404)
  })

  it("rejects an invalid date", async () => {
    const res = await POST(req({ startDate: "not-a-date", endDate: "2026-12-31" }), params())
    expect(res.status).toBe(400)
  })

  it("rejects endDate before startDate", async () => {
    const res = await POST(req({ startDate: "2026-12-31", endDate: "2026-01-01" }), params())
    expect(res.status).toBe(400)
  })

  it("rejects an unknown renewalStatus", async () => {
    const res = await POST(
      req({ startDate: "2026-01-01", endDate: "2026-12-31", renewalStatus: "PAID" }),
      params(),
    )
    expect(res.status).toBe(400)
  })

  it("rejects a non-integer reminderDaysBefore entry", async () => {
    const res = await POST(
      req({ startDate: "2026-01-01", endDate: "2026-12-31", reminderDaysBefore: [30, -1] }),
      params(),
    )
    expect(res.status).toBe(400)
  })

  it("creates the agreement with no billing fields involved", async () => {
    mockCreate.mockResolvedValue({ id: "a1" } as never)
    const res = await POST(req({ startDate: "2026-01-01", endDate: "2026-12-31" }), params())
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", actorId: "sa1" }),
    )
  })
})
