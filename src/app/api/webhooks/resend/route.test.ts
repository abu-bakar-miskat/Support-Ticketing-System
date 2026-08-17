import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Collect after() callbacks so tests can flush them explicitly
const afterCallbacks: Array<() => Promise<unknown>> = []
async function flushAfter() {
  await Promise.all(afterCallbacks.splice(0).map((cb) => cb()))
}

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: vi.fn((cb: () => Promise<unknown>) => {
      afterCallbacks.push(cb)
    }),
  }
})

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

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketMessage: { findFirst: vi.fn(), create: vi.fn() },
    intake: { findUnique: vi.fn() },
  },
}))

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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST } from "./route"
import { prisma } from "@/lib/db"
import { notifyCustomerReply } from "@/lib/notify-customer-reply"
import { notifyQuarantinedReply } from "@/lib/notify-quarantined-reply"
import { maybeReopenTicket } from "@/lib/customer-reopen"
import { isOverRateLimit } from "@/lib/inbound-rate-limit"
import * as resendMod from "resend"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVerify = (resendMod as any)._verify as ReturnType<typeof vi.fn>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReceivingGet = (resendMod as any)._receivingGet as ReturnType<typeof vi.fn>

const mockFindFirstMsg = vi.mocked(prisma.ticketMessage.findFirst)
const mockCreateMsg = vi.mocked(prisma.ticketMessage.create)
const mockFindIntake = vi.mocked(prisma.intake.findUnique)
const mockNotify = vi.mocked(notifyCustomerReply)
const mockNotifyQuarantine = vi.mocked(notifyQuarantinedReply)
const mockMaybeReopen = vi.mocked(maybeReopenTicket)
const mockIsOverRateLimit = vi.mocked(isOverRateLimit)

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
    teamId: "team-1",
    team: { prefix: "SUP" },
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
  afterCallbacks.length = 0
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

  it("returns 200 with duplicate:true on redelivered event", async () => {
    mockFindFirstMsg.mockResolvedValue({ id: "existing-msg" } as never)
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.duplicate).toBe(true)
    expect(mockCreateMsg).not.toHaveBeenCalled()
  })

  it("returns 200 immediately for a valid new event", async () => {
    const res = await POST(makeRequest(receivedEventPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.duplicate).toBeUndefined()
  })

  it("routes a token-matched reply to the correct ticket and creates inbound TicketMessage", async () => {
    await POST(makeRequest(receivedEventPayload))
    await flushAfter()

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
          providerMessageId: "<test-message-id@example.com>",
        }),
      }),
    )
  })

  it("fires a customer_reply notification after persisting", async () => {
    await POST(makeRequest(receivedEventPayload))
    await flushAfter()
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
        teamId: "team-1",
        team: { prefix: "SUP" },
        intake: { submitterEmail: "jane@example.com" },
      },
    }
    // findFirst is called 3 times: route.ts idempotency check, processInboundEmail's
    // own idempotency re-check, then the header-fallback match by In-Reply-To.
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
    await flushAfter()

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
    await flushAfter()

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
    await flushAfter()

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
    await flushAfter()

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
    await flushAfter()

    expect(mockMaybeReopen).not.toHaveBeenCalled()
  })

  it("still fires customer_reply notification even when ticket was reopened", async () => {
    mockMaybeReopen.mockResolvedValue(true) // simulate reopen happened

    await POST(makeRequest(receivedEventPayload))
    await flushAfter()

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: "ticket-1" }),
    )
  })

  it("stores message with throttled:true and suppresses notification when over rate limit", async () => {
    mockIsOverRateLimit.mockResolvedValue(true)

    await POST(makeRequest(receivedEventPayload))
    await flushAfter()

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
    await flushAfter()

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
    await flushAfter()

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
    await flushAfter()

    expect(mockCreateMsg).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockNotifyQuarantine).not.toHaveBeenCalled()
  })
})
