import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn(() => Promise.resolve()) }))

import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"
import { POST } from "./route"

const mockRequireAuth = vi.mocked(requireAuth)
const mockRecord = vi.mocked(recordAuditEvent)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/auth/logout", () => {
  it("records a USER_LOGGED_OUT audit event for the caller", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: { id: "user-1", activeTenantId: "tenant-1" },
      error: null,
    } as never)

    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorId: "user-1",
        action: "USER_LOGGED_OUT",
        targetType: "Profile",
        targetId: "user-1",
      }),
    )
  })

  it("returns the auth error and records nothing when unauthenticated", async () => {
    const errorResponse = new Response("unauthorized", { status: 401 })
    mockRequireAuth.mockResolvedValue({ profile: null, error: errorResponse } as never)

    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it("still returns ok when the audit write fails", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: { id: "user-2", activeTenantId: null },
      error: null,
    } as never)
    mockRecord.mockRejectedValueOnce(new Error("db down"))

    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
