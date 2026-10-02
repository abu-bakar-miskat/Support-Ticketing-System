import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => {
  const profile = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() }
  return {
    prisma: {
      profile,
      // Interactive transaction: run the callback with a tx that shares the profile mock.
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ profile })),
    },
  }
})
vi.mock("@/lib/auth", () => ({ requireSuperAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }))
vi.mock("@/lib/auth/ensure-auth-user", () => ({ ensureConfirmedAuthUser: vi.fn() }))

import { POST, DELETE } from "./route"
import { prisma } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"
import { ensureConfirmedAuthUser } from "@/lib/auth/ensure-auth-user"

const mockRequire = vi.mocked(requireSuperAdmin)
const mockAudit = vi.mocked(recordAuditEvent)
const mockFind = vi.mocked(prisma.profile.findFirst)
const mockUpdate = vi.mocked(prisma.profile.update)
const mockCreate = vi.mocked(prisma.profile.create)
const mockCount = vi.mocked(prisma.profile.count)
const mockEnsureAuth = vi.mocked(ensureConfirmedAuthUser)

function req(body: unknown) {
  return new Request("http://localhost/api/admin/super-admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequire.mockResolvedValue({ profile: { id: "actor-1" }, error: null } as never)
})

describe("POST /api/admin/super-admins — grant audit", () => {
  it("records a SUPER_ADMIN_GRANTED audit event (platform-level, null tenant)", async () => {
    mockFind.mockResolvedValue({ id: "u2", deletedAt: null, isSuperAdmin: false } as never)
    mockUpdate.mockResolvedValue({ id: "u2", name: "U", email: "u@x.com", avatarUrl: null } as never)

    const res = await POST(req({ userId: "u2" }))
    expect(res.status).toBe(200)
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        actorId: "actor-1",
        action: "SUPER_ADMIN_GRANTED",
        targetType: "Profile",
        targetId: "u2",
        after: { isSuperAdmin: true },
      }),
    )
  })

  it("grants by email to an existing account", async () => {
    mockFind.mockResolvedValue({ id: "u3", deletedAt: null, isSuperAdmin: false } as never)
    mockUpdate.mockResolvedValue({ id: "u3", name: "U3", email: "u3@x.com", avatarUrl: null } as never)

    const res = await POST(req({ email: "U3@x.com" }))
    expect(res.status).toBe(200)
    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "u3@x.com" } }),
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SUPER_ADMIN_GRANTED", targetId: "u3" }),
    )
  })

  it("creates a new account when the email has never signed in", async () => {
    mockFind.mockResolvedValue(null as never)
    mockEnsureAuth.mockResolvedValue({ id: "auth-new" })
    mockCreate.mockResolvedValue({
      id: "auth-new",
      name: "nobody",
      email: "nobody@x.com",
      avatarUrl: null,
    } as never)

    const res = await POST(req({ email: "nobody@x.com" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(true)
    expect(body.admin.email).toBe("nobody@x.com")
    expect(mockEnsureAuth).toHaveBeenCalledWith("nobody@x.com", "nobody")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "auth-new",
          email: "nobody@x.com",
          role: "admin",
          isSuperAdmin: true,
        }),
      }),
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPER_ADMIN_GRANTED",
        targetId: "auth-new",
        after: { isSuperAdmin: true, created: true },
      }),
    )
  })

  it("returns 404 when granting by userId and that user does not exist", async () => {
    mockFind.mockResolvedValue(null as never)
    const res = await POST(req({ userId: "missing" }))
    expect(res.status).toBe(404)
    expect(mockEnsureAuth).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/admin/super-admins — revoke audit", () => {
  it("records a SUPER_ADMIN_REVOKED audit event", async () => {
    mockCount.mockResolvedValue(2 as never)
    mockUpdate.mockResolvedValue({ id: "u2" } as never)

    const res = await DELETE(req({ userId: "u2" }))
    expect(res.status).toBe(200)
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
        actorId: "actor-1",
        action: "SUPER_ADMIN_REVOKED",
        targetType: "Profile",
        targetId: "u2",
      }),
    )
  })

  it("refuses to remove the last super-admin (no audit, no update)", async () => {
    mockCount.mockResolvedValue(1 as never)
    const res = await DELETE(req({ userId: "u2" }))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
