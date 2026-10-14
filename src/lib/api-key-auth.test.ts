import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

vi.mock("@/lib/db", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}))

import { prisma } from "@/lib/db"
import { requireApiKeyRaw } from "./api-key-auth"

const mockFindUnique = vi.mocked(prisma.apiKey.findUnique)
const mockUpdate = vi.mocked(prisma.apiKey.update)

const RAW = "pen_12345678901234567890123456789012"
const HASHED = createHash("sha256").update(RAW).digest("hex")

const keyRow = {
  id: "key-1",
  revokedAt: null,
  scope: "read_write",
  kind: "general",
  tenantId: null,
  tenant: null,
  departmentId: "dept-1",
  formConfigId: null,
  department: {
    tenantId: "tenant-1",
    tenant: { id: "tenant-1", status: "active", deletedAt: null },
  },
  createdById: "user-1",
  createdBy: { name: "Dumitru" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue(keyRow as never)
  mockUpdate.mockResolvedValue({} as never)
})

describe("requireApiKeyRaw", () => {
  it("rejects keys without the pen_ prefix", async () => {
    const res = await requireApiKeyRaw("sk-nope")
    expect(res.ctx).toBeNull()
    expect(res.error).toEqual({ message: "Invalid API key format", status: 401 })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it("rejects unknown keys", async () => {
    mockFindUnique.mockResolvedValue(null as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx).toBeNull()
    expect(res.error).toEqual({ message: "Invalid API key", status: 401 })
  })

  it("rejects revoked keys", async () => {
    mockFindUnique.mockResolvedValue({ ...keyRow, revokedAt: new Date() } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.error).toEqual({ message: "API key has been revoked", status: 401 })
  })

  it("returns the full context for a valid key, looked up by hash", async () => {
    const res = await requireApiKeyRaw(RAW)
    expect(res.error).toBeNull()
    expect(res.ctx).toEqual({
      keyId: "key-1",
      departmentId: "dept-1",
      formConfigId: null,
      tenantId: "tenant-1",
      scope: "read_write",
      kind: "general",
      createdById: "user-1",
      creatorName: "Dumitru",
    })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { hashedKey: HASHED },
      select: {
        id: true,
        revokedAt: true,
        scope: true,
        kind: true,
        tenantId: true,
        tenant: { select: { id: true, status: true, deletedAt: true } },
        departmentId: true,
        formConfigId: true,
        department: {
          select: {
            tenantId: true,
            tenant: { select: { id: true, status: true, deletedAt: true } },
          },
        },
        createdById: true,
        createdBy: { select: { name: true } },
      },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    })
  })

  it("uses the direct tenant boundary for a tenant-level key", async () => {
    mockFindUnique.mockResolvedValue({
      ...keyRow,
      tenantId: "tenant-1",
      tenant: { id: "tenant-1", status: "active", deletedAt: null },
      departmentId: null,
      department: null,
    } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx?.tenantId).toBe("tenant-1")
    expect(res.ctx?.departmentId).toBeNull()
  })

  it("rejects a legacy key that has no tenant boundary", async () => {
    mockFindUnique.mockResolvedValue({
      ...keyRow,
      tenantId: null,
      tenant: null,
      departmentId: null,
      department: null,
    } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx).toBeNull()
    expect(res.error).toEqual({ message: "API key is not bound to a tenant", status: 401 })
  })

  it("rejects keys for suspended tenants", async () => {
    mockFindUnique.mockResolvedValue({
      ...keyRow,
      tenantId: "tenant-1",
      tenant: { id: "tenant-1", status: "suspended", deletedAt: null },
    } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx).toBeNull()
    expect(res.error).toEqual({ message: "API key tenant is unavailable", status: 403 })
  })

  it("rejects portal keys on general API surfaces", async () => {
    mockFindUnique.mockResolvedValue({ ...keyRow, kind: "portal" } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx).toBeNull()
    expect(res.error).toEqual({
      message: "This key is restricted to the Support Portal API",
      status: 403,
    })
  })
})
