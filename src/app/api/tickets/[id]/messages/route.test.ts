import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

// The route imports sanitizeInboundHtml from inbound-email, which is server-only.
vi.mock("server-only", () => ({}))

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Dev User",
  email: "dev@pengroup.com",
  role: "agent" as const,
}

// Isolate the route from auth internals + email sending; RESEND_RECEIVING_ENABLED
// is a module-load const, mocked true here.
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  assertTicketAccess: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    ticketMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    attachment: { findMany: vi.fn(), updateMany: vi.fn() },
    subDepartmentStatus: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        $executeRaw: vi.fn(),
        ticket: { update: vi.fn().mockResolvedValue({}) },
      }),
    ),
  },
}))
vi.mock("@/lib/email-config", () => ({
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn().mockResolvedValue({ fromEmail: "support@pengroup.com" }),
}))
vi.mock("@/lib/email", () => ({
  sendCustomerReplyEmail: vi.fn(),
}))
vi.mock("@/lib/mailbox-ticket-customer", () => ({
  getMailboxTicketCustomer: vi.fn(),
}))
vi.mock("@/lib/timer-conversation-sync", () => ({
  syncWorkTimerWithConversation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/timer-autostart", () => ({
  startTimerOnStatusChange: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/sla-engine", () => ({
  stopFirstResponseOnPublicAgentMessage: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST } from "./route"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendCustomerReplyEmail } from "@/lib/email"
import { getMailboxTicketCustomer } from "@/lib/mailbox-ticket-customer"
import { syncWorkTimerWithConversation } from "@/lib/timer-conversation-sync"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { stopFirstResponseOnPublicAgentMessage } from "@/lib/sla-engine"

const mockRequireAuth = vi.mocked(requireAuth)
const mockAssertAccess = vi.mocked(assertTicketAccess)
const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockFindFirst = vi.mocked(prisma.ticketMessage.findFirst)
const mockCreate = vi.mocked(prisma.ticketMessage.create)
const mockSend = vi.mocked(sendCustomerReplyEmail)
const mockFindAttachments = vi.mocked(prisma.attachment.findMany)
const mockUpdateAttachments = vi.mocked(prisma.attachment.updateMany)
const mockSubDepartmentStatusFindFirst = vi.mocked(prisma.subDepartmentStatus.findFirst)
const mockSyncWorkTimer = vi.mocked(syncWorkTimerWithConversation)
const mockStartTimer = vi.mocked(startTimerOnStatusChange)
const mockStopFirstResponse = vi.mocked(stopFirstResponseOnPublicAgentMessage)

const intakeTicket = {
  id: "ticket-1",
  title: "Broken login",
  ticketNumber: 42,
  subDepartmentId: "team-abc",
  status: "IN PROGRESS",
  labels: [],
  assigneeId: null,
  creatorId: "creator-1",
  deletedAt: null,
  assignees: [],
  subDepartment: { departmentId: "dept-1", prefix: "SUP" },
  intake: {
    submitterName: "Jane Customer",
    submitterEmail: "jane@example.com",
    replyToken: "a".repeat(48),
    formConfig: { allowCustomerReplies: true },
  },
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}
const params = Promise.resolve({ id: "ticket-1" })

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ profile: mockProfile, error: null } as never)
  mockAssertAccess.mockResolvedValue(null)
  mockFindUnique.mockResolvedValue(intakeTicket as never)
  mockFindFirst.mockResolvedValue(null as never)
  vi.mocked(getMailboxTicketCustomer).mockResolvedValue(null)
  mockSend.mockResolvedValue({
    providerMessageId: "provider-msg-id",
    providerEmailId: "resend-email-id",
  })
  mockFindAttachments.mockResolvedValue([] as never)
  mockUpdateAttachments.mockResolvedValue({ count: 0 } as never)
  mockSubDepartmentStatusFindFirst.mockResolvedValue(null as never)
  vi.mocked(prisma.ticket.update).mockResolvedValue({} as never)
  mockCreate.mockImplementation(
    (async ({ data }: never) =>
      ({
        id: "msg-1",
        ...(data as object),
        author: { id: mockProfile.id, name: mockProfile.name, avatarUrl: null },
        createdAt: new Date("2026-07-07T10:00:00Z"),
      })) as never,
  )
})

describe("POST /api/tickets/[id]/messages", () => {
  it("sends the email with the token and persists an outbound message", async () => {
    const res = await POST(makeRequest({ body: "Hi Jane, on it." }), { params })
    expect(res.status).toBe(201)

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        agentName: "Dev User",
        humanId: "SUP-42",
        replyToken: "a".repeat(48),
        messageText: "Hi Jane, on it.",
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          direction: "outbound",
          status: "trusted",
          authorProfileId: mockProfile.id,
          providerMessageId: "provider-msg-id",
          bodyHtml: "Hi Jane, on it.",
        }),
      }),
    )
    const json = await res.json()
    expect(json).toMatchObject({ direction: "outbound", body: "Hi Jane, on it." })
    expect(mockSyncWorkTimer).toHaveBeenCalledWith("ticket-1", "outbound")
    expect(mockStopFirstResponse).toHaveBeenCalledWith(
      "ticket-1",
      new Date("2026-07-07T10:00:00Z"),
    )
  })

  it("persists the first-response stop before returning the reply", async () => {
    let releaseStop!: () => void
    mockStopFirstResponse.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseStop = resolve }),
    )

    let settled = false
    const responsePromise = POST(makeRequest({ body: "Hi Jane, on it." }), { params })
      .then((response) => {
        settled = true
        return response
      })

    await vi.waitFor(() => expect(mockStopFirstResponse).toHaveBeenCalled())
    expect(settled).toBe(false)

    releaseStop()
    expect((await responsePromise).status).toBe(201)
  })

  it("moves an open ticket to In Progress before applying the waiting-for-customer pause", async () => {
    mockFindUnique.mockResolvedValue({ ...intakeTicket, status: "OPEN" } as never)
    mockSubDepartmentStatusFindFirst.mockResolvedValue({ label: "IN PROGRESS" } as never)

    const res = await POST(makeRequest({ body: "I am working on this." }), { params })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.ticketStatus).toBe("IN PROGRESS")
    expect(mockStartTimer).toHaveBeenCalledWith(
      "ticket-1",
      "IN PROGRESS",
      expect.objectContaining({ id: mockProfile.id }),
    )
    expect(mockSyncWorkTimer).toHaveBeenCalledWith("ticket-1", "outbound")
    expect(mockStartTimer.mock.invocationCallOrder[0]).toBeLessThan(
      mockSyncWorkTimer.mock.invocationCallOrder[0],
    )
  })

  it("moves an escalated ticket to In Progress and drops the Escalated label", async () => {
    mockFindUnique.mockResolvedValue({
      ...intakeTicket,
      status: "ESCALATED",
      labels: ["Escalated"],
    } as never)
    mockSubDepartmentStatusFindFirst.mockResolvedValue({ label: "IN PROGRESS" } as never)
    const txTicketUpdate = vi.fn().mockResolvedValue({})
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ $executeRaw: vi.fn(), ticket: { update: txTicketUpdate } })) as never)

    const res = await POST(makeRequest({ body: "Picking this up now." }), { params })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.ticketStatus).toBe("IN PROGRESS")
    expect(txTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN PROGRESS", labels: [] }),
      }),
    )
    expect(mockStartTimer).toHaveBeenCalledWith(
      "ticket-1",
      "IN PROGRESS",
      expect.objectContaining({ id: mockProfile.id }),
    )
  })

  it("leaves a paused ticket's status alone", async () => {
    mockFindUnique.mockResolvedValue({ ...intakeTicket, status: "PAUSED" } as never)

    const res = await POST(makeRequest({ body: "Still waiting on vendor." }), { params })
    const json = await res.json()

    expect(json.ticketStatus).toBe("PAUSED")
    expect(mockSubDepartmentStatusFindFirst).not.toHaveBeenCalled()
    expect(mockStartTimer).not.toHaveBeenCalled()
  })

  it("threads the send onto the conversation's last message", async () => {
    mockFindFirst.mockResolvedValue({ providerMessageId: "prev-msg-id" } as never)
    await POST(makeRequest({ body: "Following up." }), { params })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ inReplyTo: "prev-msg-id" }),
    )
  })

  it("omits threading on the first message", async () => {
    await POST(makeRequest({ body: "First contact." }), { params })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ inReplyTo: null }),
    )
  })

  it("rejects an empty body", async () => {
    const res = await POST(makeRequest({ body: "   " }), { params })
    expect(res.status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      profile: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as never)
    const res = await POST(makeRequest({ body: "hello" }), { params })
    expect(res.status).toBe(401)
  })

  it("honours the ticket access gate", async () => {
    mockAssertAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    )
    const res = await POST(makeRequest({ body: "hello" }), { params })
    expect(res.status).toBe(403)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("409s when there is no intake origin AND no prior inbound message to derive a customer address from", async () => {
    mockFindUnique.mockResolvedValue({ ...intakeTicket, intake: null } as never)
    mockFindFirst.mockResolvedValue(null as never) // no prior inbound message either
    const res = await POST(makeRequest({ body: "hello" }), { params })
    expect(res.status).toBe(409)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("ticket #16: falls back to the most recent inbound message's address for a mailbox-originated ticket (no intake)", async () => {
    mockFindUnique.mockResolvedValue({ ...intakeTicket, intake: null } as never)
    // findFirst is called twice: once for the last inbound (fromEmail fallback),
    // once for threading (last providerMessageId) — same mock, order doesn't matter here.
    mockFindFirst.mockResolvedValueOnce({ fromName: "Jane Customer", fromEmail: "jane@example.com" } as never)
    mockFindFirst.mockResolvedValueOnce(null as never)

    const res = await POST(makeRequest({ body: "hello" }), { params })
    expect(res.status).toBe(201)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", submitterName: "Jane Customer", replyToken: null }),
    )
  })

  it("replies to a legacy mailbox ticket using its creation sender when no inbound message exists", async () => {
    mockFindUnique.mockResolvedValue({ ...intakeTicket, intake: null } as never)
    vi.mocked(getMailboxTicketCustomer).mockResolvedValue({
      fromEmail: "customer@example.com", fromName: "Original Sender",
    })
    const res = await POST(makeRequest({ body: "Hello, we received your request." }), { params })
    expect(res.status).toBe(201)
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer@example.com", submitterName: "Original Sender", replyToken: null,
    }))
  })

  it("409s when the form disallows customer replies", async () => {
    mockFindUnique.mockResolvedValue({
      ...intakeTicket,
      intake: {
        ...intakeTicket.intake,
        formConfig: { allowCustomerReplies: false },
      },
    } as never)
    const res = await POST(makeRequest({ body: "hello" }), { params })
    expect(res.status).toBe(409)
    expect(mockSend).not.toHaveBeenCalled()
  })

  // ── attachment wiring ─────────────────────────────────────────────────────

  it("downloads attachment bytes for sendCustomerReplyEmail and links messageId after send", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("attachment contents"))
    const attachmentRows = [
      { id: "att-1", storageUrl: "https://cdn.example.com/att-1.pdf", fileName: "report.pdf", fileSize: 100_000 },
      { id: "att-2", storageUrl: "https://cdn.example.com/att-2.png", fileName: "screenshot.png", fileSize: 50_000 },
    ]
    mockFindAttachments.mockResolvedValue(attachmentRows as never)

    const res = await POST(
      makeRequest({ body: "Please review attachments.", attachmentIds: ["att-1", "att-2"] }),
      { params },
    )
    expect(res.status).toBe(201)

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { content: Buffer.from("attachment contents"), filename: "report.pdf" },
          { content: Buffer.from("attachment contents"), filename: "screenshot.png" },
        ],
      }),
    )
    expect(mockUpdateAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-1", "att-2"] } },
        data: { ticketId: "ticket-1", messageId: "msg-1", status: "attached" },
      }),
    )

    const json = await res.json()
    expect(json.attachments).toHaveLength(2)
    expect(json.attachments[0]).toMatchObject({ id: "att-1", fileName: "report.pdf" })
  })

  it("returns 413 when total attachment size exceeds the outbound limit", async () => {
    const MB = 1024 * 1024
    mockFindAttachments.mockResolvedValue([
      { id: "att-big", storageUrl: "https://cdn.example.com/big.zip", fileName: "big.zip", fileSize: 26 * MB },
    ] as never)

    const res = await POST(
      makeRequest({ body: "Here is a large file.", attachmentIds: ["att-big"] }),
      { params },
    )
    expect(res.status).toBe(413)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it("sends with no attachments when attachmentIds is omitted", async () => {
    const res = await POST(makeRequest({ body: "No files." }), { params })
    expect(res.status).toBe(201)
    expect(mockFindAttachments).not.toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: undefined }),
    )
  })
})

it("GET hides internal mailbox receipts without hiding ordinary system messages", async () => {
  mockRequireAuth.mockResolvedValue({ profile: mockProfile, error: null } as never)
  mockAssertAccess.mockResolvedValue(null)
  mockFindUnique.mockResolvedValue(intakeTicket as never)
  const common = { direction: "inbound", throttled: false, fromName: "Customer", fromEmail: "c@example.test", bodyHtml: "", author: null, attachments: [], createdAt: new Date("2026-10-12T08:00:00Z") }
  vi.mocked(prisma.ticketMessage.findMany).mockResolvedValue([
    { ...common, id: "receipt", status: "system", rawPayload: { mailboxReceipt: true } },
    { ...common, id: "system", status: "system", rawPayload: null },
    { ...common, id: "reply", status: "trusted", rawPayload: null, bodyHtml: "Hello" },
  ] as never)
  const response = await GET(new Request("http://x/api/tickets/ticket-1/messages") as never, { params: Promise.resolve({ id: "ticket-1" }) })
  expect((await response.json()).map((row: { id: string }) => row.id)).toEqual(["system", "reply"])
})
