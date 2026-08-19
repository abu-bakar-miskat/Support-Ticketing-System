import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: { tenant: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock("@/lib/tenant-lifecycle", () => ({
  isValidTenantStatus: (v: unknown) => v === "active" || v === "suspended",
  suspendTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  softDeleteTenant: vi.fn(),
}))

import { requireSuperAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { suspendTenant, reactivateTenant, softDeleteTenant } from "@/lib/tenant-lifecycle"
import { PATCH, DELETE } from "./route"

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin)
const mockTenantFindUnique = vi.mocked(prisma.tenant.findUnique)
const mockTenantUpdate = vi.mocked(prisma.tenant.update)
const mockSuspend = vi.mocked(suspendTenant)
const mockReactivate = vi.mocked(reactivateTenant)
const mockSoftDelete = vi.mocked(softDeleteTenant)

function params(id = "t1") {
  return { params: Promise.resolve({ id }) }
}

function req(body: unknown) {
  return new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSuperAdmin.mockResolvedValue({ profile: { id: "sa1" }, error: null } as never)
})

describe("PATCH /api/admin/tenants/:id — SA-01", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await PATCH(req({ type: "agency" }), params())
    expect(res.status).toBe(403)
  })

  it("rejects an empty body", async () => {
    const res = await PATCH(req({}), params())
    expect(res.status).toBe(400)
  })

  it("rejects an invalid status", async () => {
    const res = await PATCH(req({ status: "archived" }), params())
    expect(res.status).toBe(400)
  })

  it("404s for an unknown tenant", async () => {
    mockTenantFindUnique.mockResolvedValue(null)
    const res = await PATCH(req({ status: "suspended" }), params())
    expect(res.status).toBe(404)
  })

  it("409s when the tenant is soft-deleted", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", deletedAt: new Date() } as never)
    const res = await PATCH(req({ status: "suspended" }), params())
    expect(res.status).toBe(409)
  })

  it("routes status: suspended through suspendTenant", async () => {
    mockTenantFindUnique.mockResolvedValueOnce({ id: "t1", deletedAt: null } as never)
    mockSuspend.mockResolvedValue({ id: "t1", status: "suspended", deletedAt: null } as never)
    mockTenantFindUnique.mockResolvedValueOnce({
      id: "t1", slug: "acme", name: "Acme", type: "company", status: "suspended", deletedAt: null,
    } as never)

    const res = await PATCH(req({ status: "suspended" }), params())

    expect(mockSuspend).toHaveBeenCalledWith({ tenantId: "t1", actorId: "sa1" })
    expect(res.status).toBe(200)
  })

  it("routes status: active through reactivateTenant", async () => {
    mockTenantFindUnique.mockResolvedValueOnce({ id: "t1", deletedAt: null } as never)
    mockReactivate.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)
    mockTenantFindUnique.mockResolvedValueOnce({
      id: "t1", slug: "acme", name: "Acme", type: "company", status: "active", deletedAt: null,
    } as never)

    const res = await PATCH(req({ status: "active" }), params())

    expect(mockReactivate).toHaveBeenCalledWith({ tenantId: "t1", actorId: "sa1" })
    expect(res.status).toBe(200)
  })

  it("still updates type directly", async () => {
    mockTenantFindUnique.mockResolvedValueOnce({ id: "t1", deletedAt: null } as never)
    mockTenantFindUnique.mockResolvedValueOnce({
      id: "t1", slug: "acme", name: "Acme", type: "agency", status: "active", deletedAt: null,
    } as never)

    const res = await PATCH(req({ type: "agency" }), params())

    expect(mockTenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { type: "agency" } })
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/admin/tenants/:id — soft-delete (SA-01)", () => {
  it("rejects non-super-admins", async () => {
    mockRequireSuperAdmin.mockResolvedValue({
      profile: null,
      error: new Response(null, { status: 403 }) as never,
    } as never)
    const res = await DELETE(new Request("http://localhost"), params())
    expect(res.status).toBe(403)
  })

  it("404s for an unknown tenant", async () => {
    mockSoftDelete.mockResolvedValue(null)
    const res = await DELETE(new Request("http://localhost"), params())
    expect(res.status).toBe(404)
  })

  it("soft-deletes via the lifecycle helper", async () => {
    mockSoftDelete.mockResolvedValue({ id: "t1", status: "active", deletedAt: new Date() } as never)
    const res = await DELETE(new Request("http://localhost"), params())
    expect(mockSoftDelete).toHaveBeenCalledWith({ tenantId: "t1", actorId: "sa1" })
    expect(res.status).toBe(200)
  })
})
