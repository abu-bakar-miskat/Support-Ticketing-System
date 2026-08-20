/**
 * Issue 010 — Resolution fold-in tests.
 * Verifies that completing a ticket sends the resolution through the
 * TicketMessage pipeline instead of the old one-shot sendResolutionEmail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Dev User",
  email: "dev@pengroup.com",
  role: "agent" as const,
}

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    subDepartmentStatus: { findMany: vi.fn() },
    ticketMessage: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    intake: { update: vi.fn() },
  },
}))
vi.mock("@/lib/dept-scope", () => ({ ticketsInScope: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/ticket-date-permissions", () => ({ canEditTicket: vi.fn().mockReturnValue(true) }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/ticket-completion-notify", () => ({ notifyTicketCompletion: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-cascade", () => ({ cascadeCompleteToSubtickets: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/email-config", () => ({
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn().mockResolvedValue({
    fromName: "PEN Platform",
    fromEmail: "support@pengroup.com",
    notifyResolution: true,
  }),
}))
vi.mock("@/lib/email", () => ({
  sendCustomerReplyEmail: vi.fn(),
}))

import { PATCH } from "./route"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendCustomerReplyEmail } from "@/lib/email"

const mockRequireAuth = vi.mocked(requireAuth)
const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockFindStatuses = vi.mocked(prisma.subDepartmentStatus.findMany)
const mockFindLastMessage = vi.mocked(prisma.ticketMessage.findFirst)
const mockCreateMessage = vi.mocked(prisma.ticketMessage.create)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockSendReply = vi.mocked(sendCustomerReplyEmail)

const intakeTicket = {
  id: "ticket-1",
  title: "Login broken",
  ticketNumber: 7,
  status: "In Progress",
  subDepartmentId: "team-1",
  assigneeId: mockProfile.id,
  creatorId: mockProfile.id,
  deletedAt: null,
  closedAt: null,
  assignees: [],
  subDepartment: { prefix: "SUP" },
  intake: {
    id: "intake-1",
    submitterName: "Jane Customer",
    submitterEmail: "jane@example.com",
    replyToken: "a".repeat(48),
    formConfig: { name: "IT Support", allowCustomerReplies: true },
  },
}

const completionStatus = { label: "Done", isComplete: true }

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/tickets/ticket-1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}
const params = Promise.resolve({ id: "ticket-1" })

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ profile: mockProfile, error: null } as never)
  mockFindTicket.mockResolvedValue(intakeTicket as never)
  mockFindStatuses.mockResolvedValue([
    { label: "In Progress", isComplete: false },
    completionStatus,
  ] as never)
  mockFindLastMessage.mockResolvedValue(null as never)
  mockSendReply.mockResolvedValue("provider-resolution-id")
  mockCreateMessage.mockResolvedValue({ id: "msg-res" } as never)
  mockTransaction.mockImplementation(
    (async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $executeRaw: vi.fn(),
        ticket: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: "ticket-1", status: "Done", cycleTime: null }),
        },
        intake: { update: vi.fn() },
      }
      return fn(tx)
    }) as never,
  )
})

describe("PATCH /api/tickets/[id]/status — resolution fold-in (issue 010)", () => {
  it("sends the resolution through sendCustomerReplyEmail with the token", async () => {
    const res = await PATCH(
      makeRequest({ to: "Done", resolutionNote: "All fixed." }),
      { params },
    )
    expect(res.status).toBe(200)
    await new Promise((r) => setImmediate(r))

    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        submitterName: "Jane Customer",
        agentName: "Dev User",
        humanId: "SUP-7",
        messageText: "All fixed.",
        replyToken: "a".repeat(48),
      }),
    )
  })

  it("persists the resolution as an outbound TicketMessage authored by the resolver", async () => {
    await PATCH(makeRequest({ to: "Done", resolutionNote: "All fixed." }), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          direction: "outbound",
          status: "trusted",
          authorProfileId: mockProfile.id,
          bodyHtml: "All fixed.",
          providerMessageId: "provider-resolution-id",
        }),
      }),
    )
  })

  it("threads the resolution onto the last message when one exists", async () => {
    mockFindLastMessage.mockResolvedValue({ providerMessageId: "prev-msg-id" } as never)
    await PATCH(makeRequest({ to: "Done", resolutionNote: "Done." }), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ inReplyTo: "prev-msg-id" }),
    )
  })

  it("omits the token when receiving is disabled", async () => {
    vi.mocked(
      (await import("@/lib/email-config")).getEmailConfig,
    ).mockResolvedValue({
      fromName: "PEN Platform",
      fromEmail: "support@pengroup.com",
      notifyResolution: true,
    } as never)

    // Simulate RESEND_RECEIVING_ENABLED = false by patching the imported constant
    const emailConfig = await import("@/lib/email-config")
    vi.spyOn(emailConfig, "RESEND_RECEIVING_ENABLED", "get").mockReturnValue(false)

    await PATCH(makeRequest({ to: "Done", resolutionNote: "Done." }), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ replyToken: null }),
    )
  })
})
