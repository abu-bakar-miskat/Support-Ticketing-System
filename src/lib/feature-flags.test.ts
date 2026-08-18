import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    featureFlag: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}))

import { prisma } from "@/lib/db"
import { isFeatureEnabled, assertFeatureEnabled, listFeatureFlags, setFeatureFlag } from "./feature-flags"

const mockFindUnique = vi.mocked(prisma.featureFlag.findUnique)
const mockFindMany = vi.mocked(prisma.featureFlag.findMany)
const mockUpsert = vi.mocked(prisma.featureFlag.upsert)
const mockAuditCreate = vi.mocked(prisma.auditEvent.create)
const mockTransaction = vi.mocked(prisma.$transaction)

beforeEach(() => {
  vi.clearAllMocks()
  mockTransaction.mockImplementation((ops: unknown) => Promise.all(ops as Promise<unknown>[]))
})

describe("isFeatureEnabled — fail-open", () => {
  it("is enabled when no row exists for the tenant/key", async () => {
    mockFindUnique.mockResolvedValue(null)
    expect(await isFeatureEnabled("t1", "bulkReassign")).toBe(true)
  })

  it("reflects an explicit disabled row", async () => {
    mockFindUnique.mockResolvedValue({ enabled: false } as never)
    expect(await isFeatureEnabled("t1", "bulkReassign")).toBe(false)
  })

  it("reflects an explicit enabled row", async () => {
    mockFindUnique.mockResolvedValue({ enabled: true } as never)
    expect(await isFeatureEnabled("t1", "bulkReassign")).toBe(true)
  })
})

describe("assertFeatureEnabled", () => {
  it("passes when the feature is enabled", async () => {
    mockFindUnique.mockResolvedValue(null)
    expect(await assertFeatureEnabled("t1", "mailboxConnections")).toEqual({ ok: true })
  })

  it("fails with an explanatory error when disabled (for a 403 response)", async () => {
    mockFindUnique.mockResolvedValue({ enabled: false } as never)
    const result = await assertFeatureEnabled("t1", "mailboxConnections")
    expect(result.ok).toBe(false)
    expect((result as { error: string }).error).toContain("mailboxConnections")
  })
})

describe("listFeatureFlags", () => {
  it("defaults every known key to enabled, then applies explicit overrides", async () => {
    mockFindMany.mockResolvedValue([{ key: "bulkReassign", enabled: false }] as never)
    const result = await listFeatureFlags("t1")
    expect(result.bulkReassign).toBe(false)
    expect(result.mailboxConnections).toBe(true)
    expect(result.customReports).toBe(true)
  })
})

describe("setFeatureFlag", () => {
  it("upserts the flag and records an audit event atomically", async () => {
    mockFindUnique.mockResolvedValue(null) // currently enabled (no row)
    await setFeatureFlag({ tenantId: "t1", key: "bulkReassign", enabled: false, actorId: "admin-1" })

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_key: { tenantId: "t1", key: "bulkReassign" } },
        update: { enabled: false, updatedById: "admin-1" },
      }),
    )
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        actorId: "admin-1",
        action: "FEATURE_FLAG_DISABLED",
        targetType: "FeatureFlag",
        targetId: "bulkReassign",
        before: { enabled: true },
        after: { enabled: false },
      }),
    })
  })

  it("records FEATURE_FLAG_ENABLED when flipping back on", async () => {
    mockFindUnique.mockResolvedValue({ enabled: false } as never)
    await setFeatureFlag({ tenantId: "t1", key: "bulkReassign", enabled: true, actorId: "admin-1" })
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "FEATURE_FLAG_ENABLED" }) }),
    )
  })

  it("is a no-op (no write, no audit event) when the value doesn't actually change", async () => {
    mockFindUnique.mockResolvedValue({ enabled: true } as never)
    await setFeatureFlag({ tenantId: "t1", key: "bulkReassign", enabled: true, actorId: "admin-1" })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })
})
