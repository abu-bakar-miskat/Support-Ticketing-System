import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { auditEvent: { create: vi.fn() } } }))

import { prisma } from "@/lib/db"
import { recordAuditEvent } from "./audit-log"

const mockCreate = vi.mocked(prisma.auditEvent.create)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recordAuditEvent", () => {
  it("writes tenantId/actorId/action/target and before/after state", async () => {
    await recordAuditEvent({
      tenantId: "t1",
      actorId: "u1",
      action: "FEATURE_FLAG_DISABLED",
      targetType: "FeatureFlag",
      targetId: "bulkReassign",
      before: { enabled: true },
      after: { enabled: false },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        departmentId: null,
        actorId: "u1",
        action: "FEATURE_FLAG_DISABLED",
        targetType: "FeatureFlag",
        targetId: "bulkReassign",
        before: { enabled: true },
        after: { enabled: false },
      },
    })
  })

  it("writes a platform-level event with a null tenantId (super-admin grant/revoke)", async () => {
    await recordAuditEvent({
      tenantId: null,
      actorId: "sa1",
      action: "SUPER_ADMIN_GRANTED",
      targetType: "Profile",
      targetId: "u9",
      before: { isSuperAdmin: false },
      after: { isSuperAdmin: true },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: null, action: "SUPER_ADMIN_GRANTED", targetId: "u9" }),
    })
  })

  it("omits before/after when not supplied", async () => {
    await recordAuditEvent({ tenantId: "t1", actorId: "u1", action: "X", targetType: "Y", targetId: "z" })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ before: undefined, after: undefined }),
    })
  })

  it("writes through a supplied transaction client", async () => {
    const tx = { auditEvent: { create: vi.fn() } } as unknown as Parameters<typeof recordAuditEvent>[0]["client"]
    await recordAuditEvent({
      client: tx,
      tenantId: "t1",
      actorId: "u1",
      action: "ROLE_ASSIGNMENTS_CHANGED",
      targetType: "Profile",
      targetId: "u2",
      before: [],
      after: [],
    })
    expect(tx!.auditEvent.create).toHaveBeenCalledOnce()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
