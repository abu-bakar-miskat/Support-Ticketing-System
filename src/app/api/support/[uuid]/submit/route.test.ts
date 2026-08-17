import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    intakeFormConfig: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    team: { findUnique: vi.fn() },
    ticket: { findUnique: vi.fn() },
    ticketMessage: { create: vi.fn() },
  },
}))
vi.mock("@/lib/intake-conversion", () => ({
  prepareConversion: vi.fn(),
  runConversion: vi.fn(),
}))
vi.mock("@/lib/email", () => ({
  sendIntakeConfirmationEmail: vi.fn(),
  sendAssignmentEmail: vi.fn(),
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/email-config", () => ({
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn().mockResolvedValue({
    fromName: "PEN Platform",
    fromEmail: "support@pengroup.com",
  }),
}))

import { POST } from "./route"
import { prisma } from "@/lib/db"
import { prepareConversion, runConversion } from "@/lib/intake-conversion"
import { sendIntakeConfirmationEmail } from "@/lib/email"

const mockPrepare = vi.mocked(prepareConversion)
const mockRun = vi.mocked(runConversion)
const mockSendConfirmation = vi.mocked(sendIntakeConfirmationEmail)
const mockFindForm = vi.mocked(prisma.intakeFormConfig.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockCreateMessage = vi.mocked(prisma.ticketMessage.create)

const form = {
  id: "form-1",
  name: "IT Support",
  isActive: true,
  intakeTeamId: "team-1",
  departmentId: "dept-1",
  allowCustomerReplies: true,
  fields: [],
}

const prep = {
  intakeTeamId: "team-1",
  formName: "IT Support",
  title: "My issue",
  description: "<p>desc</p>",
  status: "Backlog",
  priority: "Medium" as const,
  creatorId: "creator-1",
  assigneeId: null,
  assigneeName: null,
  assigneeEmail: null,
  projectId: "proj-1",
  newRotaPointer: 0,
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/support/form-1/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}
const params = Promise.resolve({ uuid: "form-1" })

const validBody = {
  submitterName: "Jane Customer",
  submitterEmail: "jane@example.com",
  priority: "Medium",
  responses: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindForm.mockResolvedValue(form as never)
  mockPrepare.mockResolvedValue(prep as never)
  mockTransaction.mockImplementation(
    (async (fn: (tx: unknown) => unknown) => fn({})) as never,
  )
  mockRun.mockResolvedValue({
    intakeId: "intake-1",
    ticketId: "ticket-1",
    replyToken: "a".repeat(48),
  } as never)
  mockSendConfirmation.mockResolvedValue({
    providerMessageId: "provider-confirm-id",
    bodyText: "Hi Jane, we got your request.",
  } as never)
  mockCreateMessage.mockResolvedValue({ id: "msg-1" } as never)
})

describe("POST /api/support/[uuid]/submit — thread bootstrap (issue 010)", () => {
  it("sends the confirmation with the reply token when receiving is enabled", async () => {
    const res = await POST(makeRequest(validBody), { params })
    expect(res.status).toBe(201)

    // Allow the fire-and-forget async IIFE to settle
    await vi.runAllTimersAsync().catch(() => undefined)
    await new Promise((r) => setImmediate(r))

    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        replyToken: "a".repeat(48),
      }),
    )
  })

  it("persists the confirmation as an outbound TicketMessage when providerMessageId is returned", async () => {
    await POST(makeRequest(validBody), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          direction: "outbound",
          status: "trusted",
          authorProfileId: null,
          providerMessageId: "provider-confirm-id",
          bodyHtml: "Hi Jane, we got your request.",
        }),
      }),
    )
  })

  it("omits the token when form disallows customer replies", async () => {
    mockFindForm.mockResolvedValue({ ...form, allowCustomerReplies: false } as never)
    await POST(makeRequest(validBody), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ replyToken: null }),
    )
  })

  it("does not create a TicketMessage when the send returns no providerMessageId", async () => {
    mockSendConfirmation.mockResolvedValue({
      providerMessageId: null,
      bodyText: "",
    } as never)
    await POST(makeRequest(validBody), { params })
    await new Promise((r) => setImmediate(r))

    expect(mockCreateMessage).not.toHaveBeenCalled()
  })
})
