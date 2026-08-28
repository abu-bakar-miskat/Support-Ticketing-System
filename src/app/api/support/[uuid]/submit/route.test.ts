import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    intakeFormConfig: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    subDepartment: { findUnique: vi.fn() },
    ticket: { findUnique: vi.fn() },
    ticketMessage: { create: vi.fn() },
    profile: { findFirst: vi.fn() },
    verifiedEmail: { findUnique: vi.fn() },
    pendingIntake: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    slaPolicy: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/intake-conversion", () => ({
  prepareConversion: vi.fn(),
  runConversion: vi.fn(),
}))
vi.mock("@/lib/email", () => ({
  sendIntakeConfirmationEmail: vi.fn(),
  sendAssignmentEmail: vi.fn(),
  sendIntakeManagerAlertEmail: vi.fn(),
  sendIntakeVerificationEmail: vi.fn(),
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/email-config", () => ({
  RESEND_RECEIVING_ENABLED: true,
  getEmailConfig: vi.fn().mockResolvedValue({
    fromName: "Support Ticketing System",
    fromEmail: "support@pengroup.com",
  }),
}))
vi.mock("@/lib/email-validation", () => ({
  isValidEmailFormat: () => true,
  domainAcceptsMail: vi.fn().mockResolvedValue(true),
}))
vi.mock("@/lib/department-setup", () => ({
  assertDepartmentOperational: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("@/lib/sla-engine", () => ({ startSlaTimers: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/rule-executor", () => ({ applyRulesToTicket: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/assignment-engine", () => ({ recordAssignmentFailure: vi.fn() }))

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
const mockFindProfile = vi.mocked(prisma.profile.findFirst)
const mockFindVerified = vi.mocked(prisma.verifiedEmail.findUnique)
const mockFindSubDept = vi.mocked(prisma.subDepartment.findUnique)
const mockFindTicket = vi.mocked(prisma.ticket.findUnique)

const form = {
  id: "form-1",
  name: "IT Support",
  isActive: true,
  intakeSubDepartmentId: "team-1",
  departmentId: "dept-1",
  allowCustomerReplies: true,
  autoAssign: true,
  schemaVersion: 1,
  fields: [],
}

const prep = {
  intakeSubDepartmentId: "team-1",
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
  assignmentFailed: false,
  managers: [],
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
  mockFindProfile.mockResolvedValue({ id: "acct-1" } as never)
  mockFindVerified.mockResolvedValue(null)
  mockFindSubDept.mockResolvedValue({ prefix: "IT", tenantId: "t1" } as never)
  mockFindTicket.mockResolvedValue({ ticketNumber: 1, createdAt: new Date() } as never)
})

describe("POST /api/support/[uuid]/submit — thread bootstrap (issue 010)", () => {
  it("sends the confirmation with the reply token when receiving is enabled", async () => {
    const res = await POST(makeRequest(validBody), { params })
    expect(res.status).toBe(201)

    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        replyToken: "a".repeat(48),
      }),
    )
  })

  it("persists the confirmation as an outbound TicketMessage when providerMessageId is returned", async () => {
    await POST(makeRequest(validBody), { params })

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

    expect(mockCreateMessage).not.toHaveBeenCalled()
  })
})
