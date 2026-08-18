import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

// The route imports sanitizeInboundHtml from inbound-email, which is server-only.
vi.mock("server-only", () => ({}))

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Dev User",
  email: "dev@pengroup.com",
  role: "staff" as const,
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
    ticketMessage: { create: vi.fn(), findFirst: vi.fn() },
    attachment: { findMany: vi.fn(), updateMany: vi.fn() },
    teamStatus: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/email-config", () => ({
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn().mockResolvedValue({ fromEmail: "support@pengroup.com" }),
}))
vi.mock("@/lib/email", () => ({
  sendCustomerReplyEmail: vi.fn(),
}))

import { POST } from "./route"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendCustomerReplyEmail } from "@/lib/email"

const mockRequireAuth = vi.mocked(requireAuth)
const mockAssertAccess = vi.mocked(assertTicketAccess)
const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockFindFirst = vi.mocked(prisma.ticketMessage.findFirst)
const mockCreate = vi.mocked(prisma.ticketMessage.create)
const mockSend = vi.mocked(sendCustomerReplyEmail)
const mockFindAttachments = vi.mocked(prisma.attachment.findMany)
const mockUpdateAttachments = vi.mocked(prisma.attachment.updateMany)
const mockTeamStatusFindFirst = vi.mocked(prisma.teamStatus.findFirst)

const intakeTicket = {
  id: "ticket-1",
  title: "Broken login",
  ticketNumber: 42,
  subDepartmentId: "team-abc",
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
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ profile: mockProfile, error: null } as never)
  mockAssertAccess.mockResolvedValue(null)
  mockFindUnique.mockResolvedValue(intakeTicket as never)
  mockFindFirst.mockResolvedValue(null as never)
  mockSend.mockResolvedValue("provider-msg-id")
  mockFindAttachments.mockResolvedValue([] as never)
  mockUpdateAttachments.mockResolvedValue({ count: 0 } as never)
  mockTeamStatusFindFirst.mockResolvedValue(null as never)
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

  it("passes attachment URLs to sendCustomerReplyEmail and links messageId after send", async () => {
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
          { path: "https://cdn.example.com/att-1.pdf", filename: "report.pdf" },
          { path: "https://cdn.example.com/att-2.png", filename: "screenshot.png" },
        ],
      }),
    )
    expect(mockUpdateAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-1", "att-2"] } },
        data: { messageId: "msg-1" },
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
      expect.objectContaining({ attachments: [] }),
    )
  })
})
