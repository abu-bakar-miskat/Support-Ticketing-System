import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("resend", () => {
  const verify = vi.fn()
  const receivingGet = vi.fn()
  const receivingAttachmentsGet = vi.fn()
  class Resend {
    webhooks = { verify }
    emails = { receiving: { get: receivingGet, attachments: { get: receivingAttachmentsGet } } }
    constructor() {}
  }
  // Exposed so tests can assert on them after import
  return { Resend, _verify: verify, _receivingGet: receivingGet, _receivingAttachmentsGet: receivingAttachmentsGet }
})

vi.mock("@/lib/email-config", () => ({
  INBOUND_DOMAIN: "reply.pengroup.com",
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn(),
}))

vi.mock("@/lib/db", () => {
  // Shared so `tx.ticketMessage` inside $transaction is the same mock the tests
  // drive via mockFindFirstMsg / mockCreateMsg.
  const ticketMessage = { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  return {
    prisma: {
      ticketMessage,
      ticket: { update: vi.fn(), findFirst: vi.fn() },
      intake: { findUnique: vi.fn() },
      subDepartment: { findUnique: vi.fn() },
      activityLog: { create: vi.fn() },
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ $executeRaw: vi.fn().mockResolvedValue(undefined), ticketMessage }),
      ),
    },
  }
})

vi.mock("@/lib/notify-customer-reply", () => ({
  notifyCustomerReply: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/notify-quarantined-reply", () => ({
  notifyQuarantinedReply: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/customer-reopen", () => ({
  maybeReopenTicket: vi.fn().mockResolvedValue(false),
}))

vi.mock("@/lib/inbound-rate-limit", () => ({
  isOverRateLimit: vi.fn().mockResolvedValue(false),
}))

vi.mock("@/lib/mailbox-connection", () => ({
  findMailboxConnectionForRecipients: vi.fn().mockResolvedValue(null),
  logMailSuppression: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/mailbox-ticket-creation", () => ({
  createTicketFromInboundEmail: vi.fn(),
  MailboxInactiveError: class MailboxInactiveError extends Error {},
  DuplicateInboundEmailError: class DuplicateInboundEmailError extends Error {},
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST } from "./route"
import { prisma } from "@/lib/db"
import { notifyCustomerReply } from "@/lib/notify-customer-reply"
import { notifyQuarantinedReply } from "@/lib/notify-quarantined-reply"
import { maybeReopenTicket } from "@/lib/customer-reopen"
import { isOverRateLimit } from "@/lib/inbound-rate-limit"
import { findMailboxConnectionForRecipients, logMailSuppression } from "@/lib/mailbox-connection"
import {
  createTicketFromInboundEmail,
  DuplicateInboundEmailError,
  MailboxInactiveError,
} from "@/lib/mailbox-ticket-creation"
import * as resendMod from "resend"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVerify = (resendMod as any)._verify as ReturnType<typeof vi.fn>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReceivingGet = (resendMod as any)._receivingGet as ReturnType<typeof vi.fn>

const mockFindFirstMsg = vi.mocked(prisma.ticketMessage.findFirst)
const mockCreateMsg = vi.mocked(prisma.ticketMessage.create)
const mockUpdateMsg = vi.mocked(prisma.ticketMessage.update)
const mockActivityCreate = vi.mocked(prisma.activityLog.create)
const mockFindIntake = vi.mocked(prisma.intake.findUnique)
const mockNotify = vi.mocked(notifyCustomerReply)
const mockNotifyQuarantine = vi.mocked(notifyQuarantinedReply)
const mockMaybeReopen = vi.mocked(maybeReopenTicket)
const mockIsOverRateLimit = vi.mocked(isOverRateLimit)
const mockFindMailboxConnection = vi.mocked(findMailboxConnectionForRecipients)
const mockLogMailSuppression = vi.mocked(logMailSuppression)
const mockCreateTicketFromInboundEmail = vi.mocked(createTicketFromInboundEmail)

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TOKEN = "a".repeat(48)
const INBOUND_DOMAIN = "reply.pengroup.com"

const receivedEventPayload = {
  type: "email.received",
  created_at: "2026-07-08T10:00:00Z",
  data: {
    email_id: "recv-email-001",
    created_at: "2026-07-08T10:00:00Z",
    from: "Jane Customer <jane@example.com>",
    to: [`reply-${TOKEN}@${INBOUND_DOMAIN}`],
    bcc: [],
    cc: [],
    message_id: "<test-message-id@example.com>",
    subject: "Re: [SUP-7] Login broken",
    attachments: [],
  },
}

const fullEmail = {
  id: "recv-email-001",
  from: "Jane Customer <jane@example.com>",
  to: [`reply-${TOKEN}@${INBOUND_DOMAIN}`],
  subject: "Re: [SUP-7] Login broken",
  text: "Still not working for me.",
  html: "<p>Still not working for me.</p>",
  headers: {},
  message_id: "<test-message-id@example.com>",
  attachments: [],
  created_at: "2026-07-08T10:00:00Z",
  bcc: null,
  cc: null,
  reply_to: null,
}

const intakeMatch = {
  submitterEmail: "jane@example.com",
  ticket: {
    id: "ticket-1",
    title: "Login broken",
    ticketNumber: 7,
    assigneeId: "assignee-1",
    creatorId: "creator-1",
    subDepartmentId: "team-1",
    subDepartment: { prefix: "SUP" },
  },
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": "svix-event-001",
      "svix-timestamp": "1720432800",
      "svix-signature": "v1,abc123",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: valid signature that returns receivedEventPayload
  mockVerify.mockReturnValue(receivedEventPayload)
  // Default: no duplicate
  mockFindFirstMsg.mockResolvedValue(null as never)
  // Default: intake found
  mockFindIntake.mockResolvedValue(intakeMatch as never)
  // Default: full email content
  mockReceivingGet.mockResolvedValue({ data: fullEmail, error: null })
  // Default: ticketMessage create succeeds (mirrors the real `select` shape processInboundEmail relies on)
  mockCreateMsg.mockResolvedValue({
    id: "msg-inbound-1",
    direction: "inbound",
    status: "trusted",
    bodyHtml: "<p>Still not working for me.</p>",
    fromName: "Jane Customer",
    fromEmail: "jane@example.com",
    createdAt: new Date("2026-07-08T10:00:00Z"),
    throttled: false,
  } as never)
  mockUpdateMsg.mockResolvedValue({} as never)
  mockActivityCreate.mockResolvedValue({} as never)
  vi.mocked(prisma.ticket.update).mockResolvedValue({} as never)
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue(null as never)
  mockFindMailboxConnection.mockResolvedValue(null)
  mockCreateTicketFromInboundEmail.mockReset()

  // Patch INBOUND_DOMAIN for extractReplyToken to work
  vi.stubEnv("RESEND_INBOUND_DOMAIN", INBOUND_DOMAIN)
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-webhook-secret")
  // getResendClient() requires this to be set, even though signature verification itself doesn't use it
  vi.stubEnv("RESEND_API_KEY", "test-api-key")
})

// ── Route tests ───────────────────────────────────────────────────────────────

describe("POST /api/webhooks/resend", () => {
  it("rejects a request with an invalid svix signature", async () => {
    mockVerify.mockImplementation(() => { throw new Error("Invalid signature") })
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(401)
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("skips non-email.received event types gracefully", async () => {
    mockVerify.mockReturnValue({ type: "email.delivered", created_at: "", data: {} })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skipped).toBe("email.delivered")
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("records a bounce against the matching outbound message (MAIL-03)", async () => {
    mockVerify.mockReturnValue({
      type: "email.bounced",
      created_at: "",
      data: { email_id: "provider-confirm-id", bounce: { message: "user unknown" } },
    })
    mockFindFirstMsg.mockResolvedValue({
      id: "msg-out-1",
      ticketId: "ticket-1",
      ticket: { creatorId: "creator-1" },
    } as never)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.delivery).toBe("email.bounced")
    expect(mockUpdateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-out-1" },
        data: expect.objectContaining({
          deliveryStatus: "bounced",
          deliveryError: "user unknown",
        }),
      }),
    )
    expect(mockActivityCreate).toHaveBeenCalled()
  })

  it("returns 200 with duplicate:true on redelivered event", async () => {
    mockFindFirstMsg.mockResolvedValue({ id: "existing-msg" } as never)
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.duplicate).toBe(true)
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("processes a valid new event inline and returns stored", async () => {
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.stored).toBe(true)
    expect(json.duplicate).toBeUndefined()
    expect(mockCreateMsg).toHaveBeenCalled()
  })

  it("does not create a duplicate when a concurrent run already stored the reply (race)", async () => {
    // The route-level and top-of-function idempotency checks miss because the
    // concurrent run's row isn't committed yet, but the re-check inside the
    // advisory-locked transaction finds it — the insert must be skipped.
    mockFindFirstMsg
      .mockResolvedValueOnce(null as never) // route.ts idempotency
      .mockResolvedValueOnce(null as never) // processInboundEmail idempotency
      .mockResolvedValueOnce({ id: "already-there" } as never) // in-transaction re-check
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.stored).toBe(false)
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("routes a token-matched reply to the correct ticket and creates inbound TicketMessage", async () => {
    await POST(makeRequest(receivedEventPayload))

    expect(mockFindIntake).toHaveBeenCalledWith(
      expect.objectContaining({ where: { replyToken: TOKEN } }),
    )
    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          direction: "inbound",
          status: "trusted",
          authorProfileId: null,
          fromName: "Jane Customer",
          fromEmail: "jane@example.com",
          providerMessageId: "test-message-id@example.com",
        }),
      }),
    )
  })

  it("uses the inbound email body as the description for a new mailbox ticket", async () => {
    const mailboxEvent = {
      ...receivedEventPayload,
      data: {
        ...receivedEventPayload.data,
        to: ["support@pengroup.com"],
        subject: "Cannot access my account",
      },
    }
    mockVerify.mockReturnValue(mailboxEvent)
    mockFindIntake.mockResolvedValue(null as never)
    mockFindMailboxConnection.mockResolvedValue({
      id: "mailbox-1",
      address: "support@pengroup.com",
      tenantId: "tenant-1",
      departmentId: "department-1",
      subDepartmentId: "team-1",
      isActive: true,
    })
    mockCreateTicketFromInboundEmail.mockResolvedValue({
      id: "ticket-new",
      ticketNumber: 8,
      subDepartmentPrefix: "SUP",
      creatorId: "creator-1",
      assigneeId: null,
      message: {
        id: "msg-new",
        direction: "inbound",
        status: "trusted",
        bodyHtml: "<p>I cannot sign in to my account.</p>",
        fromName: "Alice",
        fromEmail: "alice@example.com",
        createdAt: new Date(),
        throttled: false,
      },
    })
    mockReceivingGet.mockResolvedValue({
      data: {
        ...fullEmail,
        // A forwarding provider may return its rewritten destination here;
        // mailbox attribution must retain the original webhook envelope.
        to: ["forwarded@inbound.pengroup.com"],
        subject: "Cannot access my account",
        text: null,
        html: "<p>I cannot sign in to my account.</p>",
      },
      error: null,
    })

    const res = await POST(makeRequest(mailboxEvent))

    expect(res.status).toBe(200)
    expect(mockCreateTicketFromInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Cannot access my account",
        description: "<p>I cannot sign in to my account.</p>",
        mailboxConnectionId: "mailbox-1",
        // The first message is stored with the ticket, not separately.
        inboundMessage: expect.objectContaining({
          data: expect.objectContaining({
            status: "trusted",
            rawPayload: expect.objectContaining({
              to: ["forwarded@inbound.pengroup.com"],
              envelopeTo: ["support@pengroup.com"],
              mailboxConnectionId: "mailbox-1",
            }),
          }),
        }),
      }),
    )
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("does not create a second ticket when a concurrent run already stored the email", async () => {
    const mailboxEvent = {
      ...receivedEventPayload,
      data: { ...receivedEventPayload.data, to: ["support@pengroup.com"] },
    }
    mockVerify.mockReturnValue(mailboxEvent)
    mockFindIntake.mockResolvedValue(null as never)
    mockFindMailboxConnection.mockResolvedValue({
      id: "mailbox-1",
      address: "support@pengroup.com",
      tenantId: "tenant-1",
      departmentId: "department-1",
      subDepartmentId: "team-1",
      isActive: true,
    })
    mockCreateTicketFromInboundEmail.mockRejectedValue(new DuplicateInboundEmailError())

    const res = await POST(makeRequest(mailboxEvent))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, stored: false })
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("drops a new mailbox email when the mailbox is turned off during creation", async () => {
    const mailboxEvent = {
      ...receivedEventPayload,
      data: {
        ...receivedEventPayload.data,
        to: ["support@pengroup.com"],
        subject: "Cannot access my account",
      },
    }
    mockVerify.mockReturnValue(mailboxEvent)
    mockFindIntake.mockResolvedValue(null as never)
    mockFindMailboxConnection.mockResolvedValue({
      id: "mailbox-1",
      address: "support@pengroup.com",
      tenantId: "tenant-1",
      departmentId: "department-1",
      subDepartmentId: "team-1",
      isActive: true,
    })
    mockCreateTicketFromInboundEmail.mockRejectedValue(new MailboxInactiveError())

    const res = await POST(makeRequest(mailboxEvent))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, stored: false })
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("records email received while a mailbox is off without creating a ticket", async () => {
    const mailboxEvent = {
      ...receivedEventPayload,
      data: {
        ...receivedEventPayload.data,
        to: ["support@pengroup.com"],
        subject: "Cannot access my account",
      },
    }
    mockVerify.mockReturnValue(mailboxEvent)
    mockFindIntake.mockResolvedValue(null as never)
    mockFindMailboxConnection.mockResolvedValue({
      id: "mailbox-1",
      address: "support@pengroup.com",
      tenantId: "tenant-1",
      departmentId: "department-1",
      subDepartmentId: "team-1",
      isActive: false,
    })

    const res = await POST(makeRequest(mailboxEvent))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, stored: false })
    expect(mockCreateTicketFromInboundEmail).not.toHaveBeenCalled()
    expect(mockCreateMsg).not.toHaveBeenCalled()
    expect(mockLogMailSuppression).toHaveBeenCalledWith(expect.objectContaining({
      mailboxConnectionId: "mailbox-1",
      reason: "mailbox_paused",
      subject: "Re: [SUP-7] Login broken",
    }))
  })

  it("fires a customer_reply notification after persisting", async () => {
    await POST(makeRequest(receivedEventPayload))
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket-1" }),
    )
  })

  it("routes via header-fallback when no token is present", async () => {
    // Override: recipient has no token, but In-Reply-To matches a stored message
    const noTokenEvent = {
      ...receivedEventPayload,
      data: {
        ...receivedEventPayload.data,
        to: ["support@pengroup.com"],
      },
    }
    mockVerify.mockReturnValue(noTokenEvent)
    mockFindIntake.mockResolvedValue(null as never) // token query returns nothing

    const priorMsg = {
      ticket: {
        id: "ticket-1",
        title: "Login broken",
        ticketNumber: 7,
        assigneeId: "assignee-1",
        creatorId: "creator-1",
        subDepartmentId: "team-1",
        subDepartment: { prefix: "SUP" },
        intake: { submitterEmail: "jane@example.com" },
      },
    }
    // findFirst order: route.ts idempotency check, processInboundEmail's own
    // idempotency check, the header-fallback match by In-Reply-To (priorMsg),
    // then the in-transaction dedup re-check (falls through to the null default).
    mockFindFirstMsg
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(priorMsg as never)

    // email has In-Reply-To
    mockReceivingGet.mockResolvedValue({
      data: {
        ...fullEmail,
        to: ["support@pengroup.com"],
        headers: { "in-reply-to": "<prev-outbound-id@resend.dev>" },
      },
      error: null,
    })

    await POST(makeRequest(noTokenEvent))

    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          direction: "inbound",
        }),
      }),
    )
  })

  it("returns 503 when RESEND_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "")
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(503)
  })

  it("quarantines a message when sender does not match submitter email", async () => {
    // Intake has a different submitter email than the inbound From
    mockFindIntake.mockResolvedValue({
      ...intakeMatch,
      submitterEmail: "other@example.com", // mismatch
    } as never)

    await POST(makeRequest(receivedEventPayload))

    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "quarantined",
          ticketId: "ticket-1",
        }),
      }),
    )
    expect(mockNotifyQuarantine).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket-1" }),
    )
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("does not quarantine when submitter email is unknown (null)", async () => {
    mockFindIntake.mockResolvedValue({
      ...intakeMatch,
      submitterEmail: null,
    } as never)

    await POST(makeRequest(receivedEventPayload))

    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "trusted" }),
      }),
    )
    expect(mockNotify).toHaveBeenCalled()
    expect(mockNotifyQuarantine).not.toHaveBeenCalled()
  })

  it("calls maybeReopenTicket for trusted inbound messages", async () => {
    await POST(makeRequest(receivedEventPayload))

    expect(mockMaybeReopen).toHaveBeenCalledWith(
      "ticket-1",
      "team-1",
      "creator-1",
    )
  })

  it("does not call maybeReopenTicket for quarantined messages", async () => {
    mockFindIntake.mockResolvedValue({
      ...intakeMatch,
      submitterEmail: "other@example.com", // triggers quarantine
    } as never)

    await POST(makeRequest(receivedEventPayload))

    expect(mockMaybeReopen).not.toHaveBeenCalled()
  })

  it("still fires customer_reply notification even when ticket was reopened", async () => {
    mockMaybeReopen.mockResolvedValue(true) // simulate reopen happened

    await POST(makeRequest(receivedEventPayload))

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket-1" }),
    )
  })

  it("stores message with throttled:true and suppresses notification when over rate limit", async () => {
    mockIsOverRateLimit.mockResolvedValue(true)

    await POST(makeRequest(receivedEventPayload))

    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ throttled: true }),
      }),
    )
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockMaybeReopen).not.toHaveBeenCalled()
  })

  it("stores message with throttled:false and notifies on normal-volume threads", async () => {
    mockIsOverRateLimit.mockResolvedValue(false)

    await POST(makeRequest(receivedEventPayload))

    expect(mockCreateMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ throttled: false }),
      }),
    )
    expect(mockNotify).toHaveBeenCalled()
  })

  it("does not call isOverRateLimit for system (auto-reply) messages", async () => {
    mockReceivingGet.mockResolvedValue({
      data: { ...fullEmail, headers: { "Auto-Submitted": "auto-replied" } },
      error: null,
    })

    await POST(makeRequest(receivedEventPayload))

    expect(mockIsOverRateLimit).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it("drops (no create) when no token and no header fallback match", async () => {
    const noMatchEvent = {
      ...receivedEventPayload,
      data: { ...receivedEventPayload.data, to: ["support@pengroup.com"] },
    }
    mockVerify.mockReturnValue(noMatchEvent)
    mockFindIntake.mockResolvedValue(null as never)
    // Both findFirst calls return null (idempotency + fallback)
    mockFindFirstMsg.mockResolvedValue(null as never)
    mockReceivingGet.mockResolvedValue({
      data: { ...fullEmail, to: ["support@pengroup.com"], headers: {} },
      error: null,
    })

    await POST(makeRequest(noMatchEvent))

    expect(mockCreateMsg).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockNotifyQuarantine).not.toHaveBeenCalled()
  })
})
