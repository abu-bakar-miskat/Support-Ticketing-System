import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/tenant-lifecycle", () => ({ purgeTenant: vi.fn() }))

import { requireSuperAdmin } from "@/lib/auth"
import { purgeTenant } from "@/lib/tenant-lifecycle"
import { DELETE } from "./route"

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockPurge = vi.mocked(purgeTenant)

function params(id = "t1") {
  return { params: Promise.resolve({ id }) }
}

function req(body?: unknown) {
  return new Request("http://localhost", {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ profile: { id: "sa1" }, error: null } as never)
})

describe("DELETE /api/admin/tenants/:id/purge — SA-01 permanent delete", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await DELETE(req({ confirmSlug: "acme" }), params())
    expect(res.status).toBe(403)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it("400s when confirmSlug is missing", async () => {
    const res = await DELETE(req({}), params())
    expect(res.status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it("404s for an unknown tenant", async () => {
    mockPurge.mockResolvedValue(null)
    const res = await DELETE(req({ confirmSlug: "acme" }), params())
    expect(res.status).toBe(404)
  })

  it("409s when the tenant is not soft-deleted or the slug mismatches", async () => {
    mockPurge.mockRejectedValue(new Error("Tenant must be soft-deleted before it can be permanently deleted"))
    const res = await DELETE(req({ confirmSlug: "acme" }), params())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/soft-deleted/)
  })

  it("purges via the lifecycle helper and passes the confirmation slug", async () => {
    mockPurge.mockResolvedValue({ id: "t1", slug: "acme", purged: true } as never)
    const res = await DELETE(req({ confirmSlug: "acme" }), params())
    expect(mockPurge).toHaveBeenCalledWith({ tenantId: "t1", actorId: "sa1", confirmSlug: "acme" })
    expect(res.status).toBe(200)
  })
})
