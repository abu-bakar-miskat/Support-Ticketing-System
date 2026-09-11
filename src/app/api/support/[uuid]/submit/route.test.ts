import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    intakeFormConfig: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
    verifiedEmail: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
    subDepartment: { findUnique: vi.fn() },
    ticket: { findUnique: vi.fn() },
    ticketMessage: { create: vi.fn() },
    pendingIntake: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
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
import { sendIntakeConfirmationEmail, sendIntakeVerificationEmail } from "@/lib/email"

const mockPrepare = vi.mocked(prepareConversion)
const mockRun = vi.mocked(runConversion)
const mockSendConfirmation = vi.mocked(sendIntakeConfirmationEmail)
const mockSendVerification = vi.mocked(sendIntakeVerificationEmail)
const mockFindForm = vi.mocked(prisma.intakeFormConfig.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockCreateMessage = vi.mocked(prisma.ticketMessage.create)
const mockPendingCreate = vi.mocked(prisma.pendingIntake.create)
const mockFindSubDept = vi.mocked(prisma.subDepartment.findUnique)
const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockFindAccount = vi.mocked(prisma.profile.findFirst)
const mockFindVerifiedEmail = vi.mocked(prisma.verifiedEmail.findUnique)

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
  mockFindAccount.mockResolvedValue(null)
  mockFindVerifiedEmail.mockResolvedValue(null)
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
    providerEmailId: "resend-confirm-id",
    bodyText: "Hi Jane, we got your request.",
  } as never)
  mockCreateMessage.mockResolvedValue({ id: "msg-1" } as never)
  // Confirmation email is available by default: submissions become pending, not tickets.
  mockSendVerification.mockResolvedValue({ ok: true, skipped: false } as never)
  mockPendingCreate.mockResolvedValue({ id: "pending-1", token: "b".repeat(48) } as never)
  vi.mocked(prisma.pendingIntake.delete).mockResolvedValue(undefined as never)
  mockFindSubDept.mockResolvedValue({ prefix: "IT", tenantId: "t1" } as never)
  mockFindTicket.mockResolvedValue({ ticketNumber: 1, createdAt: new Date() } as never)
})

describe("POST /api/support/[uuid]/submit — email confirmation gate", () => {
  it("stores a pending intake and sends a verification link instead of creating a ticket", async () => {
    const res = await POST(makeRequest(validBody), { params })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ pending: true, email: "jane@example.com" })
    expect(mockPendingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ formConfigId: "form-1", email: "jane@example.com" }),
      }),
    )
    expect(mockSendVerification).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" }),
    )
    // No ticket may exist before the link is clicked.
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockSendConfirmation).not.toHaveBeenCalled()
  })

  it("does not create a ticket if the confirmation email is rejected", async () => {
    mockSendVerification.mockResolvedValue({ ok: false, skipped: false } as never)
    const res = await POST(makeRequest(validBody), { params })

    expect(res.status).toBe(400)
    expect(mockRun).not.toHaveBeenCalled()
    expect(prisma.pendingIntake.delete).toHaveBeenCalled()
  })
})

describe("POST /api/support/[uuid]/submit — trusted submitters", () => {
  it("creates the ticket immediately for an active account", async () => {
    mockFindAccount.mockResolvedValue({ id: "profile-1" } as never)

    const res = await POST(makeRequest(validBody), { params })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json).toEqual({ pending: false, ticketId: "ticket-1", humanId: "IT-1" })
    expect(mockRun).toHaveBeenCalledOnce()
    expect(mockPendingCreate).not.toHaveBeenCalled()
    expect(mockSendVerification).not.toHaveBeenCalled()
    expect(mockSendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" }),
    )
  })

  it("creates the ticket immediately for a previously verified external email", async () => {
    mockFindVerifiedEmail.mockResolvedValue({ email: "jane@example.com" } as never)

    const res = await POST(makeRequest(validBody), { params })

    expect(res.status).toBe(201)
    expect(mockRun).toHaveBeenCalledOnce()
    expect(mockPendingCreate).not.toHaveBeenCalled()
    expect(mockSendVerification).not.toHaveBeenCalled()
  })
})

describe("POST /api/support/[uuid]/submit — thread bootstrap (issue 010)", () => {
  // These cover the direct-creation path taken when confirmation email is
  // unavailable/disabled for the department (nothing to confirm), where the
  // ticket is created inline and its confirmation thread is bootstrapped.
  beforeEach(() => {
    mockSendVerification.mockResolvedValue({ ok: false, skipped: true } as never)
  })

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
      providerEmailId: null,
      bodyText: "",
    } as never)
    await POST(makeRequest(validBody), { params })

    expect(mockCreateMessage).not.toHaveBeenCalled()
  })
})
