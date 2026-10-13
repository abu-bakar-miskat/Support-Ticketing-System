import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    mailboxConnection: { updateMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  },
}))
const provider = { authType: "OAUTH_M365", initialCursor: vi.fn(), fetchNewMessages: vi.fn(), checkHealth: vi.fn() }
vi.mock("@/lib/mail-providers", async () => {
  const types = await vi.importActual<typeof import("@/lib/mail-providers/types")>("@/lib/mail-providers/types")
  return {
    getPullMailProvider: vi.fn(() => provider),
    MailProviderError: types.MailProviderError,
    PULL_AUTH_TYPES: ["OAUTH_M365"],
  }
})
vi.mock("@/lib/mailbox-connection", () => ({
  pullContextFor: vi.fn(() => ({ credentials: {}, saveCredentials: vi.fn() })),
  recordMailboxConnectionFailure: vi.fn(),
}))
vi.mock("@/lib/process-inbound-email", () => ({ processNormalizedInboundEmail: vi.fn() }))

import { prisma } from "@/lib/db"
import { MailProviderError } from "@/lib/mail-providers/types"
import { recordMailboxConnectionFailure } from "@/lib/mailbox-connection"
import { processNormalizedInboundEmail } from "@/lib/process-inbound-email"
import { syncMailboxConnection } from "./mailbox-sync"

const mockLease = vi.mocked(prisma.mailboxConnection.updateMany)
const mockUpdate = vi.mocked(prisma.mailboxConnection.update)
const mockFind = vi.mocked(prisma.mailboxConnection.findUniqueOrThrow)
const mockProcess = vi.mocked(processNormalizedInboundEmail)

const connection = (syncCursor: unknown) => ({
  id: "mc-1", address: "support@acme.com", authType: "OAUTH_M365", credentialsRef: "enc",
  syncCursor, status: "ACTIVE", failureCount: 0, departmentId: "dept-1",
})
const email = (id: string, messageId: string | null = `<${id}@x>`) => ({
  providerMessageId: id, messageId, from: "a@b.com", to: [], subject: null, text: null, html: null, headers: {}, attachments: [],
})
/** syncCursor values written, in order. */
const savedCursors = () =>
  mockUpdate.mock.calls.map(([arg]) => (arg.data as { syncCursor?: unknown }).syncCursor).filter((c) => c !== undefined)

beforeEach(() => {
  vi.clearAllMocks()
  mockLease.mockResolvedValue({ count: 1 })
  mockUpdate.mockResolvedValue({} as never)
})

describe("syncMailboxConnection", () => {
  it("skips when another run holds the lease", async () => {
    mockLease.mockResolvedValue({ count: 0 })
    expect(await syncMailboxConnection("mc-1")).toEqual({ processed: 0, skipped: "locked" })
    expect(mockFind).not.toHaveBeenCalled()
  })

  it("stores an initial cursor on first sync without importing history", async () => {
    mockFind.mockResolvedValue(connection(null) as never)
    provider.initialCursor.mockResolvedValue({ since: "2026-10-13T12:00:00.000Z", ids: [] })
    expect(await syncMailboxConnection("mc-1")).toEqual({ processed: 0 })
    expect(provider.fetchNewMessages).not.toHaveBeenCalled()
    expect(savedCursors()).toEqual([{ v: { since: "2026-10-13T12:00:00.000Z", ids: [] } }])
  })

  it("routes each message to its connection and advances the cursor per message", async () => {
    mockFind.mockResolvedValue(connection({ v: "c0" }) as never)
    provider.fetchNewMessages.mockResolvedValue({
      messages: [{ email: email("m1"), cursorAfter: "c1" }, { email: email("m2", null), cursorAfter: "c2" }],
    })
    expect(await syncMailboxConnection("mc-1")).toEqual({ processed: 2 })
    expect(provider.fetchNewMessages).toHaveBeenCalledWith(expect.anything(), "c0", 20)
    expect(mockProcess).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messageId: "<m1@x>", mailboxConnectionId: "mc-1", recipients: ["support@acme.com"],
    }))
    // No Message-ID header → provider-scoped fallback id.
    expect(mockProcess).toHaveBeenNthCalledWith(2, expect.objectContaining({ messageId: "oauth_m365.mc-1.m2" }))
    expect(savedCursors()).toEqual([{ v: "c1" }, { v: "c2" }])
    // Lease is always released.
    expect(mockUpdate).toHaveBeenLastCalledWith({ where: { id: "mc-1" }, data: { syncLockedUntil: null } })
  })

  it("keeps the cursor on a failing message and retries it next run", async () => {
    mockFind.mockResolvedValue(connection({ v: "c0" }) as never)
    provider.fetchNewMessages.mockResolvedValue({ messages: [{ email: email("m1"), cursorAfter: "c1" }] })
    mockProcess.mockRejectedValueOnce(new Error("db down"))
    const result = await syncMailboxConnection("mc-1")
    expect(result).toMatchObject({ processed: 0, error: "db down" })
    expect(savedCursors()).toEqual([{ v: "c0", retry: { id: "m1", attempts: 1 } }])
    expect(recordMailboxConnectionFailure).not.toHaveBeenCalled()
  })

  it("skips a message that keeps failing so the mailbox isn't blocked", async () => {
    mockFind.mockResolvedValue(connection({ v: "c0", retry: { id: "m1", attempts: 2 } }) as never)
    provider.fetchNewMessages.mockResolvedValue({
      messages: [{ email: email("m1"), cursorAfter: "c1" }, { email: email("m2"), cursorAfter: "c2" }],
    })
    mockProcess.mockRejectedValueOnce(new Error("malformed"))
    expect(await syncMailboxConnection("mc-1")).toEqual({ processed: 2 })
    expect(savedCursors()).toEqual([{ v: "c1" }, { v: "c2" }])
  })

  it("marks the connection failing on a provider auth error", async () => {
    mockFind.mockResolvedValue(connection({ v: "c0" }) as never)
    provider.fetchNewMessages.mockRejectedValue(new MailProviderError("invalid_grant", "auth"))
    await syncMailboxConnection("mc-1")
    expect(recordMailboxConnectionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mc-1" }), "invalid_grant", expect.any(Date), { status: "AUTH_ERROR" },
    )
  })

  it("leaves failing connections to the health-check backoff", async () => {
    mockFind.mockResolvedValue({ ...connection({ v: "c0" }), status: "AUTH_ERROR" } as never)
    expect(await syncMailboxConnection("mc-1")).toEqual({ processed: 0, skipped: "failing" })
    expect(provider.fetchNewMessages).not.toHaveBeenCalled()
  })
})
