import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/tenant-lifecycle", () => ({ restoreTenant: vi.fn() }))

import { requireSuperAdmin } from "@/lib/auth"
import { restoreTenant } from "@/lib/tenant-lifecycle"
import { POST } from "./route"

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockRestore = vi.mocked(restoreTenant)

function params(id = "t1") {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ profile: { id: "sa1" }, error: null } as never)
})

describe("POST /api/admin/tenants/:id/restore — SA-01", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await POST(new Request("http://localhost"), params())
    expect(res.status).toBe(403)
  })

  it("404s for an unknown tenant", async () => {
    mockRestore.mockResolvedValue(null)
    const res = await POST(new Request("http://localhost"), params())
    expect(res.status).toBe(404)
  })

  it("restores via the lifecycle helper without data loss", async () => {
    mockRestore.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)
    const res = await POST(new Request("http://localhost"), params())
    expect(mockRestore).toHaveBeenCalledWith({ tenantId: "t1", actorId: "sa1" })
    expect(res.status).toBe(200)
  })
})
