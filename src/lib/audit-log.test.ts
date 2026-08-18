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
        actorId: "u1",
        action: "FEATURE_FLAG_DISABLED",
        targetType: "FeatureFlag",
        targetId: "bulkReassign",
        before: { enabled: true },
        after: { enabled: false },
      },
    })
  })

  it("omits before/after when not supplied", async () => {
    await recordAuditEvent({ tenantId: "t1", actorId: "u1", action: "X", targetType: "Y", targetId: "z" })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ before: undefined, after: undefined }),
    })
  })
})
