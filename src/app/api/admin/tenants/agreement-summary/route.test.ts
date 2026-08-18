import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/agreements", () => ({ listTenantAgreementSummaries: vi.fn() }))

import { requireSuperAdmin } from "@/lib/auth"
import { listTenantAgreementSummaries } from "@/lib/agreements"
import { GET } from "./route"

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockList = vi.mocked(listTenantAgreementSummaries)

const rows = [
  {
    tenantId: "t1",
    tenantName: "Acme",
    tenantStatus: "active",
    agreementEndDate: new Date("2026-12-31"),
    renewalStatus: "ACTIVE",
    departmentCount: 3,
    activeUserCount: 5,
  },
  {
    tenantId: "t2",
    tenantName: "Beta",
    tenantStatus: "active",
    agreementEndDate: new Date("2026-09-01"),
    renewalStatus: "EXPIRED",
    departmentCount: 1,
    activeUserCount: 2,
  },
]

function makeRequest(qs = "") {
  return new NextRequest(`http://localhost/api/admin/tenants/agreement-summary?${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ profile: { id: "sa1" }, error: null } as never)
  mockList.mockResolvedValue(rows as never)
})

describe("GET /api/admin/tenants/agreement-summary — SA-05", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it("returns every tenant unfiltered by default", async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it("filters by renewalStatus", async () => {
    const res = await GET(makeRequest("renewalStatus=EXPIRED"))
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].tenantId).toBe("t2")
  })

  it("sorts ascending by agreementEndDate", async () => {
    const res = await GET(makeRequest("sortBy=agreementEndDate"))
    const body = await res.json()
    expect(body.map((r: { tenantId: string }) => r.tenantId)).toEqual(["t2", "t1"])
  })

  it("sorts descending by activeUserCount", async () => {
    const res = await GET(makeRequest("sortBy=activeUserCount&sortDir=desc"))
    const body = await res.json()
    expect(body.map((r: { tenantId: string }) => r.tenantId)).toEqual(["t1", "t2"])
  })
})
