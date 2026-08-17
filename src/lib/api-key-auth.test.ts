import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

vi.mock("@/lib/db", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}))

import { prisma } from "@/lib/db"
import { requireApiKeyRaw } from "./api-key-auth"

const mockFindUnique = vi.mocked(prisma.apiKey.findUnique)
const mockUpdate = vi.mocked(prisma.apiKey.update)

const RAW = "pen_testkey123"
const HASHED = createHash("sha256").update(RAW).digest("hex")

const keyRow = {
  id: "key-1",
  revokedAt: null,
  scope: "read_write",
  departmentId: "dept-1",
  department: { tenantId: "tenant-1" },
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
      tenantId: "tenant-1",
      scope: "read_write",
      createdById: "user-1",
      creatorName: "Dumitru",
    })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { hashedKey: HASHED },
      select: {
        id: true,
        revokedAt: true,
        scope: true,
        departmentId: true,
        department: { select: { tenantId: true } },
        createdById: true,
        createdBy: { select: { name: true } },
      },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    })
  })

  it("resolves tenantId to null for a department-less key", async () => {
    mockFindUnique.mockResolvedValue({
      ...keyRow,
      departmentId: null,
      department: null,
    } as never)
    const res = await requireApiKeyRaw(RAW)
    expect(res.ctx?.tenantId).toBeNull()
    expect(res.ctx?.departmentId).toBeNull()
  })
})
