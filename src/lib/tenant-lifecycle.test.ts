import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
    profile: { findUnique: vi.fn() },
  },
}))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastForceLogout: vi.fn() }))

import { prisma } from "@/lib/db"
import { recordAuditEvent } from "@/lib/audit-log"
import { broadcastForceLogout } from "@/lib/realtime-broadcast"
import {
  suspendTenant,
  reactivateTenant,
  softDeleteTenant,
  restoreTenant,
  tenantBlocksLogin,
  loginBlockReason,
  isValidTenantStatus,
} from "./tenant-lifecycle"

const mockTenantFindUnique = vi.mocked(prisma.tenant.findUnique)
const mockTenantUpdate = vi.mocked(prisma.tenant.update)
const mockMembershipFindMany = vi.mocked(prisma.tenantMembership.findMany)
const mockProfileFindUnique = vi.mocked(prisma.profile.findUnique)
const mockRecordAuditEvent = vi.mocked(recordAuditEvent)
const mockBroadcast = vi.mocked(broadcastForceLogout)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isValidTenantStatus", () => {
  it("accepts active and suspended, rejects anything else", () => {
    expect(isValidTenantStatus("active")).toBe(true)
    expect(isValidTenantStatus("suspended")).toBe(true)
    expect(isValidTenantStatus("deleted")).toBe(false)
    expect(isValidTenantStatus(123)).toBe(false)
  })
})

describe("tenantBlocksLogin", () => {
  it("blocks when suspended", () => {
    expect(tenantBlocksLogin({ status: "suspended", deletedAt: null })).toBe(true)
  })
  it("blocks when soft-deleted regardless of status", () => {
    expect(tenantBlocksLogin({ status: "active", deletedAt: new Date() })).toBe(true)
  })
  it("does not block an active, non-deleted tenant", () => {
    expect(tenantBlocksLogin({ status: "active", deletedAt: null })).toBe(false)
  })
})

describe("suspendTenant — SA-01", () => {
  it("returns null for an unknown tenant", async () => {
    mockTenantFindUnique.mockResolvedValue(null)
    const result = await suspendTenant({ tenantId: "t1", actorId: "sa1" })
    expect(result).toBeNull()
    expect(mockTenantUpdate).not.toHaveBeenCalled()
  })

  it("throws if the tenant is already soft-deleted", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: new Date() } as never)
    await expect(suspendTenant({ tenantId: "t1", actorId: "sa1" })).rejects.toThrow(/soft-deleted/)
  })

  it("is a no-op (no audit/broadcast) when already suspended", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "suspended", deletedAt: null } as never)
    await suspendTenant({ tenantId: "t1", actorId: "sa1" })
    expect(mockTenantUpdate).not.toHaveBeenCalled()
    expect(mockRecordAuditEvent).not.toHaveBeenCalled()
  })

  it("suspends, audits, and force-logs-out every active member", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)
    mockTenantUpdate.mockResolvedValue({ id: "t1", status: "suspended", deletedAt: null } as never)
    mockMembershipFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never)

    const result = await suspendTenant({ tenantId: "t1", actorId: "sa1" })

    expect(result).toEqual({ id: "t1", status: "suspended", deletedAt: null })
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENANT_SUSPENDED", targetType: "Tenant" }),
    )
    expect(mockBroadcast).toHaveBeenCalledWith(["u1", "u2"], expect.stringContaining("suspended"))
  })
})

describe("reactivateTenant", () => {
  it("throws if the tenant is soft-deleted", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "suspended", deletedAt: new Date() } as never)
    await expect(reactivateTenant({ tenantId: "t1", actorId: "sa1" })).rejects.toThrow(/soft-deleted/)
  })

  it("reactivates and audits without a broadcast (re-enable restores access, no kick needed)", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "suspended", deletedAt: null } as never)
    mockTenantUpdate.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)

    await reactivateTenant({ tenantId: "t1", actorId: "sa1" })

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENANT_REACTIVATED" }),
    )
    expect(mockBroadcast).not.toHaveBeenCalled()
  })
})

describe("softDeleteTenant / restoreTenant — reversible, no data loss", () => {
  it("soft-deletes, audits, and force-logs-out members", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)
    mockTenantUpdate.mockResolvedValue({ id: "t1", status: "active", deletedAt: new Date() } as never)
    mockMembershipFindMany.mockResolvedValue([{ userId: "u1" }] as never)

    await softDeleteTenant({ tenantId: "t1", actorId: "sa1" })

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "TENANT_DELETED" }))
    expect(mockBroadcast).toHaveBeenCalledWith(["u1"], expect.stringContaining("removed"))
  })

  it("is a no-op when already soft-deleted", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: new Date() } as never)
    await softDeleteTenant({ tenantId: "t1", actorId: "sa1" })
    expect(mockTenantUpdate).not.toHaveBeenCalled()
  })

  it("restores without touching data and without a broadcast", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: new Date() } as never)
    mockTenantUpdate.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)

    const result = await restoreTenant({ tenantId: "t1", actorId: "sa1" })

    expect(result).toEqual({ id: "t1", status: "active", deletedAt: null })
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "TENANT_RESTORED" }))
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it("is a no-op when not deleted", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "t1", status: "active", deletedAt: null } as never)
    await restoreTenant({ tenantId: "t1", actorId: "sa1" })
    expect(mockTenantUpdate).not.toHaveBeenCalled()
  })
})

describe("loginBlockReason — SA-01/SA-03", () => {
  it("returns null for an unknown profile", async () => {
    mockProfileFindUnique.mockResolvedValue(null)
    expect(await loginBlockReason("u1")).toBeNull()
  })

  it("flags an individually restricted user", async () => {
    mockProfileFindUnique.mockResolvedValue({ isActive: false, isSuperAdmin: false, deletedAt: null } as never)
    expect(await loginBlockReason("u1")).toMatch(/restricted/)
  })

  it("never blocks a super-admin on tenant grounds", async () => {
    mockProfileFindUnique.mockResolvedValue({ isActive: true, isSuperAdmin: true, deletedAt: null } as never)
    expect(await loginBlockReason("u1")).toBeNull()
    expect(mockMembershipFindMany).not.toHaveBeenCalled()
  })

  it("returns null when at least one tenant membership is unaffected", async () => {
    mockProfileFindUnique.mockResolvedValue({ isActive: true, isSuperAdmin: false, deletedAt: null } as never)
    mockMembershipFindMany.mockResolvedValue([
      { tenant: { status: "suspended", deletedAt: null } },
      { tenant: { status: "active", deletedAt: null } },
    ] as never)
    expect(await loginBlockReason("u1")).toBeNull()
  })

  it("blocks with a suspension message when every tenant is suspended", async () => {
    mockProfileFindUnique.mockResolvedValue({ isActive: true, isSuperAdmin: false, deletedAt: null } as never)
    mockMembershipFindMany.mockResolvedValue([{ tenant: { status: "suspended", deletedAt: null } }] as never)
    expect(await loginBlockReason("u1")).toMatch(/suspended/)
  })

  it("blocks with a removal message when the (only) tenant is soft-deleted", async () => {
    mockProfileFindUnique.mockResolvedValue({ isActive: true, isSuperAdmin: false, deletedAt: null } as never)
    mockMembershipFindMany.mockResolvedValue([{ tenant: { status: "active", deletedAt: new Date() } }] as never)
    expect(await loginBlockReason("u1")).toMatch(/removed/)
  })
})
