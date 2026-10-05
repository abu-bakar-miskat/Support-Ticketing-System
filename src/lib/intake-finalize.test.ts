import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    intakeFormConfig: { findUnique: vi.fn() },
    slaPolicy: { findFirst: vi.fn() },
    subDepartment: { findFirst: vi.fn(), findUnique: vi.fn() },
    ticket: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/email", () => ({
  sendIntakeConfirmationEmail: vi
    .fn()
    .mockResolvedValue({ providerMessageId: null, providerEmailId: null, bodyText: "" }),
  sendAssignmentEmail: vi.fn().mockResolvedValue(undefined),
  sendIntakeManagerAlertEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/intake-conversion", () => ({ prepareConversion: vi.fn(), runConversion: vi.fn() }))
vi.mock("@/lib/email-config", () => ({ RESEND_RECEIVING_ENABLED: true, getEmailConfig: vi.fn() }))
vi.mock("@/lib/sla-engine", () => ({ startSlaTimers: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/rule-executor", () => ({ applyRulesToTicket: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/assignment-engine", () => ({ recordAssignmentFailure: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from "@/lib/db"
import { prepareConversion, runConversion } from "@/lib/intake-conversion"
import { createTicketFromPayload } from "./intake-finalize"

const mockFindForm = vi.mocked(prisma.intakeFormConfig.findUnique)
const mockFindPolicy = vi.mocked(prisma.slaPolicy.findFirst)
const mockFindFirstSub = vi.mocked(prisma.subDepartment.findFirst)
const mockFindUniqueSub = vi.mocked(prisma.subDepartment.findUnique)
const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockPrepare = vi.mocked(prepareConversion)
const mockRun = vi.mocked(runConversion)

// A department-scoped form: no fixed sub-department of its own.
const deptForm = {
  id: "form-1",
  name: "IT Support",
  departmentId: "dept-1",
  intakeSubDepartmentId: null,
  autoAssign: true,
  schemaVersion: 1,
  fields: [],
  department: { tenantId: "ten-1" },
}

const payload = {
  submitterName: "Ann",
  submitterEmail: "ann@x.com",
  title: "Help",
  priority: null,
  issueId: null as string | null,
  responses: [],
  idempotencyKey: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindForm.mockResolvedValue(deptForm as never)
  mockPrepare.mockResolvedValue({
    intakeSubDepartmentId: "resolved",
    title: "Help",
    assigneeId: null,
    assignmentFailed: false,
    creatorId: "creator-1",
  } as never)
  mockTransaction.mockImplementation((async (cb: (tx: unknown) => unknown) => cb({})) as never)
  mockRun.mockResolvedValue({ ticketId: "t1", replyToken: "r1" } as never)
  mockFindUniqueSub.mockResolvedValue({ prefix: "DFT", tenantId: "ten-1" } as never)
  mockFindTicket.mockResolvedValue({ ticketNumber: 1, createdAt: new Date() } as never)
})

describe("createTicketFromPayload — department-scoped routing", () => {
  it("falls back to the department's default sub-department when no issue routes", async () => {
    mockFindFirstSub.mockResolvedValue({ id: "default-team" } as never)

    await createTicketFromPayload("form-1", { ...payload, issueId: null })

    expect(mockFindFirstSub).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-1" }, orderBy: { id: "asc" } }),
    )
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ intakeSubDepartmentId: "default-team", departmentId: "dept-1" }),
    )
  })

  it("routes to the chosen issue's sub-department without touching the default", async () => {
    mockFindPolicy.mockResolvedValue({
      priority: "High",
      resolutionMins: 60,
      subDepartmentId: "routed-team",
      assignees: [],
      assigneeRotaPointer: 0,
    } as never)

    await createTicketFromPayload("form-1", { ...payload, issueId: "issue-1" })

    expect(mockFindFirstSub).not.toHaveBeenCalled()
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ intakeSubDepartmentId: "routed-team" }),
    )
  })

  it("uses the chosen issue's department for tenant-wide portal routing", async () => {
    mockFindPolicy.mockResolvedValue({
      priority: "Medium",
      resolutionMins: 120,
      departmentId: "dept-2",
      subDepartmentId: "team-2",
    } as never)

    await createTicketFromPayload("form-1", { ...payload, issueId: "issue-2" })

    expect(mockPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-2", intakeSubDepartmentId: "team-2" }),
    )
  })

  it("throws only when the department has no sub-departments at all", async () => {
    mockFindFirstSub.mockResolvedValue(null as never)

    await expect(createTicketFromPayload("form-1", { ...payload, issueId: null })).rejects.toThrow(
      /no sub-department/,
    )
    expect(mockPrepare).not.toHaveBeenCalled()
  })
})
