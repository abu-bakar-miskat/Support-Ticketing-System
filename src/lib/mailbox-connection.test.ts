import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    mailboxConnection: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    mailSuppressionLog: { create: vi.fn() },
    departmentManager: { findMany: vi.fn() },
    tenantMembership: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/mailbox-credentials", () => ({
  encryptMailboxCredentials: vi.fn((s: string) => `encrypted(${s})`),
  decryptMailboxCredentials: vi.fn(() => JSON.stringify({ kind: "oauth", refreshToken: "r", account: "a@x.com" })),
}))
vi.mock("@/lib/mail-providers", () => ({ getPullMailProvider: vi.fn() }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/email", () => ({ sendMailboxConnectionFailedAlertEmail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from "@/lib/db"
import { encryptMailboxCredentials } from "@/lib/mailbox-credentials"
import { getPullMailProvider } from "@/lib/mail-providers"
import { createNotification } from "@/lib/notify"
import { sendMailboxConnectionFailedAlertEmail } from "@/lib/email"
import {
  createMailboxConnection,
  updateMailboxConnection,
  logMailSuppression,
  checkMailboxConnectionHealth,
  sweepMailboxConnectionHealth,
} from "./mailbox-connection"

const mockCreate = vi.mocked(prisma.mailboxConnection.create)
const mockUpdate = vi.mocked(prisma.mailboxConnection.update)
const mockFindUnique = vi.mocked(prisma.mailboxConnection.findUnique)
const mockFindManyDue = vi.mocked(prisma.mailboxConnection.findMany)
const mockSuppressionCreate = vi.mocked(prisma.mailSuppressionLog.create)
const mockManagers = vi.mocked(prisma.departmentManager.findMany)
const mockTenantAdmins = vi.mocked(prisma.tenantMembership.findMany)
const mockGetProvider = vi.mocked(getPullMailProvider)
const mockCreateNotification = vi.mocked(createNotification)
const mockSendAlert = vi.mocked(sendMailboxConnectionFailedAlertEmail)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createMailboxConnection", () => {
  it("encrypts plaintext credentials before storing, and lowercases the address", async () => {
    mockCreate.mockResolvedValue({ id: "mc-1" } as never)

    await createMailboxConnection({
      tenantId: "t1", departmentId: "d1", subDepartmentId: "team-1",
      scopeType: "DEPARTMENT", address: "Support@Tickets.PenGroup.com",
      authType: "OAUTH_M365", plaintextCredentials: "super-secret", actorId: "admin-1",
    })

    expect(encryptMailboxCredentials).toHaveBeenCalledWith("super-secret")
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ address: "support@tickets.pengroup.com", credentialsRef: "encrypted(super-secret)" }),
      }),
    )
    // NFR-03: credentialsRef must never appear in the select.
    const select = mockCreate.mock.calls[0][0].select as Record<string, unknown>
    expect(select).not.toHaveProperty("credentialsRef")
  })

  it("stores null credentialsRef when no credentials are supplied", async () => {
    mockCreate.mockResolvedValue({ id: "mc-1" } as never)
    await createMailboxConnection({
      tenantId: "t1", departmentId: null, subDepartmentId: null,
      scopeType: "TENANT", address: "noreply@pengroup.com", authType: "OAUTH_M365", actorId: "admin-1",
    })
    expect(encryptMailboxCredentials).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ credentialsRef: null }) }))
  })
})

describe("updateMailboxConnection", () => {
  it("updates only the given fields and never selects credentialsRef", async () => {
    mockFindUnique.mockResolvedValue({ id: "mc-1", isActive: true } as never)
    mockUpdate.mockResolvedValue({ id: "mc-1", isActive: false } as never)
    await updateMailboxConnection("mc-1", { isActive: false }, "admin-1")
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }))
    const select = mockUpdate.mock.calls[0][0].select as Record<string, unknown>
    expect(select).not.toHaveProperty("credentialsRef")
  })
})

describe("logMailSuppression", () => {
  it("writes a MailSuppressionLog row", async () => {
    await logMailSuppression({
      tenantId: "t1", mailboxConnectionId: "mc-1", providerMessageId: "m1",
      fromEmail: "a@b.com", toAddress: "support@tickets.pengroup.com", subject: "Out of office", reason: "auto_generated",
    })
    expect(mockSuppressionCreate).toHaveBeenCalledWith({
      data: { tenantId: "t1", mailboxConnectionId: "mc-1", providerMessageId: "m1", fromEmail: "a@b.com", toAddress: "support@tickets.pengroup.com", subject: "Out of office", reason: "auto_generated" },
    })
  })

  it("never throws, even if the write fails", async () => {
    mockSuppressionCreate.mockRejectedValue(new Error("db down"))
    await expect(
      logMailSuppression({ tenantId: "t1", mailboxConnectionId: "mc-1", providerMessageId: "m1", fromEmail: null, toAddress: null, subject: null, reason: "auto_generated" }),
    ).resolves.toBeUndefined()
  })
})

const baseConnection = {
  id: "mc-1",
  authType: "OAUTH_M365" as const,
  credentialsRef: "enc",
  status: "ACTIVE" as const,
  failureCount: 0,
  tenantId: "t1",
  departmentId: "d1",
  address: "support@tickets.pengroup.com",
}

describe("checkMailboxConnectionHealth", () => {
  it("resets status/failureCount and clears backoff on success", async () => {
    mockFindUnique.mockResolvedValue(baseConnection as never)
    mockGetProvider.mockReturnValue({ checkHealth: vi.fn().mockResolvedValue({ ok: true }) } as never)

    const now = new Date("2026-01-01T00:00:00Z")
    await checkMailboxConnectionHealth("mc-1", now)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "mc-1" },
      data: { status: "ACTIVE", failureCount: 0, lastCheckedAt: now, lastErrorAt: null, lastErrorMessage: null, nextCheckAt: null },
    })
    expect(mockManagers).not.toHaveBeenCalled()
  })

  it("sets AUTH_ERROR, increments failureCount, and schedules the next check with backoff", async () => {
    mockFindUnique.mockResolvedValue({ ...baseConnection, failureCount: 1 } as never)
    mockGetProvider.mockReturnValue({ checkHealth: vi.fn().mockResolvedValue({ ok: false, error: "bad key" }) } as never)
    mockManagers.mockResolvedValue([])

    const now = new Date("2026-01-01T00:00:00Z")
    await checkMailboxConnectionHealth("mc-1", now)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "mc-1" },
      data: {
        status: "AUTH_ERROR",
        failureCount: 2,
        lastCheckedAt: now,
        lastErrorAt: now,
        lastErrorMessage: "bad key",
        nextCheckAt: new Date(now.getTime() + 15 * 60_000), // backoff step for failureCount=2
      },
    })
  })

  it("notifies department managers only on the FIRST failure after being healthy", async () => {
    mockFindUnique.mockResolvedValue(baseConnection as never) // status ACTIVE
    mockGetProvider.mockReturnValue({ checkHealth: vi.fn().mockResolvedValue({ ok: false, error: "unreachable" }) } as never)
    mockManagers.mockResolvedValue([{ user: { id: "mgr-1", name: "Mo", email: "mo@x.com" } }] as never)

    await checkMailboxConnectionHealth("mc-1")

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "mgr-1", type: "mailbox_connection_failed" }),
    )
    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({ to: "mo@x.com", address: "support@tickets.pengroup.com", error: "unreachable" }),
    )
  })

  it("notifies the tenant's admins when the tenant (send-only) mailbox fails", async () => {
    mockFindUnique.mockResolvedValue({ ...baseConnection, departmentId: null } as never)
    mockGetProvider.mockReturnValue({ checkHealth: vi.fn().mockResolvedValue({ ok: false, error: "invalid_grant" }) } as never)
    mockTenantAdmins.mockResolvedValue([{ user: { id: "adm-1", name: "Ana", email: "ana@x.com" } }] as never)

    await checkMailboxConnectionHealth("mc-1")

    expect(mockManagers).not.toHaveBeenCalled()
    expect(mockTenantAdmins).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", role: "admin", isActive: true } }))
    expect(mockSendAlert).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@x.com", error: "invalid_grant" }))
  })

  it("does not re-notify on a subsequent failure while already unhealthy", async () => {
    mockFindUnique.mockResolvedValue({ ...baseConnection, status: "AUTH_ERROR" } as never)
    mockGetProvider.mockReturnValue({ checkHealth: vi.fn().mockResolvedValue({ ok: false, error: "still bad" }) } as never)

    await checkMailboxConnectionHealth("mc-1")

    expect(mockManagers).not.toHaveBeenCalled()
  })

  it("treats a missing provider implementation as a failure", async () => {
    mockFindUnique.mockResolvedValue({ ...baseConnection, authType: "IMAP" } as never)
    mockGetProvider.mockReturnValue(null)
    mockManagers.mockResolvedValue([])

    await checkMailboxConnectionHealth("mc-1")

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "AUTH_ERROR" }) }))
  })

  it("is a no-op (never throws) when the connection no longer exists", async () => {
    mockFindUnique.mockResolvedValue(null as never)
    await expect(checkMailboxConnectionHealth("gone")).resolves.toBeUndefined()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe("sweepMailboxConnectionHealth", () => {
  it("checks every ACTIVE connection plus any connection due for a backoff retry", async () => {
    mockFindManyDue.mockResolvedValue([{ id: "mc-1" }, { id: "mc-2" }] as never)
    mockFindUnique.mockResolvedValue(null as never) // short-circuits checkMailboxConnectionHealth

    const result = await sweepMailboxConnectionHealth()

    expect(result).toEqual({ checked: 2 })
    expect(mockFindUnique).toHaveBeenCalledTimes(2)
  })
})
