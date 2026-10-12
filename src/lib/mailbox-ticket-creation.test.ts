vi.mock("@/lib/notify-mailbox-ticket-created", () => ({ notifyMailboxTicketCreated: m.arrival }))
import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  arrival: vi.fn().mockResolvedValue(undefined), duplicate: vi.fn().mockResolvedValue(null), lock: vi.fn().mockResolvedValue(1), sla: vi.fn(), mailboxSla: vi.fn().mockResolvedValue({ source: "mailbox", tenantId: "tenant-1" }), timerCreate: vi.fn(), rules: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ id: "email-ticket", ticketNumber: 12, createdAt: new Date("2026-10-09T09:00:00Z") }),
  audit: vi.fn().mockResolvedValue({}), origin: vi.fn().mockResolvedValue(null),
  message: vi.fn().mockResolvedValue({ id: "message-1" }),
}))
vi.mock("@/lib/db", () => ({ prisma: {
  subDepartment: { findUniqueOrThrow: vi.fn().mockResolvedValue({ tenantId: "tenant-1", prefix: "SUP" }) },
  departmentManager: { findFirst: vi.fn().mockResolvedValue(null) },
  $transaction: vi.fn(async callback => callback({
    $executeRaw: m.lock,
    ticketMessage: { findFirst: m.duplicate, create: m.message },
    slaTimer: { create: m.timerCreate }, ticket: { create: m.create }, activityLog: { create: m.audit, findFirst: m.origin },
  })),
} }))
vi.mock("@/lib/assignment-engine", () => ({
  autoAssignTicket: vi.fn().mockResolvedValue({ assigneeId: null }), recordAssignmentFailure: vi.fn(),
}))
vi.mock("@/lib/board-data", () => ({ getSubDepartmentStatuses: vi.fn().mockResolvedValue([{ label: "To Do" }]) }))
vi.mock("@/lib/support-project", () => ({ resolveSupportProjectForDepartment: vi.fn().mockResolvedValue("support-project") }))
vi.mock("@/lib/intake-conversion", () => ({ ensureSystemUser: vi.fn().mockResolvedValue("system-user") }))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn() }))
vi.mock("@/lib/sla-engine", () => ({ startSlaTimers: m.sla, prepareMailboxSla: m.mailboxSla }))
vi.mock("@/lib/rule-executor", () => ({ applyRulesToTicket: m.rules }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: vi.fn() }))
vi.mock("@/lib/department-setup", () => ({ assertDepartmentOperational: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/db"
import { createTicketFromInboundEmail, DuplicateInboundEmailError } from "./mailbox-ticket-creation"

beforeEach(() => vi.clearAllMocks())

describe("mailbox ticket creation", () => {
  it("starts only the department mailbox SLA (no form policies) and disables SLA rules", async () => {
    const ticket = await createTicketFromInboundEmail({
      departmentId: "dept-1", teamId: "sub-1", fromEmail: "customer@example.test",
      fromName: "Customer", subject: "Email request", description: "<p>Help</p>",
      inboundMessage: { providerMessageIds: ["email-1"], data: {
        providerMessageId: "email-1", direction: "inbound", bodyHtml: "<p>Help</p>",
        fromName: "Customer", fromEmail: "customer@example.test",
      } },
    })
    expect(ticket.id).toBe("email-ticket")
    expect(m.create).toHaveBeenCalledOnce()
    expect(m.message).toHaveBeenCalledWith({ data: expect.objectContaining({ ticketId: "email-ticket", providerMessageId: "email-1", status: "system", bodyHtml: "", rawPayload: { mailboxReceipt: true } }) })
    expect(m.arrival).toHaveBeenCalledWith({ ticketId: "email-ticket", tenantId: "tenant-1", departmentId: "dept-1", mailboxConnectionId: undefined })
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: "<p>Help</p>" }) }))
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ providerMessageId: "email-1", fromEmail: "customer@example.test" }) }) }))
    expect(m.sla).not.toHaveBeenCalled()
    expect(m.mailboxSla).toHaveBeenCalledWith("tenant-1", "dept-1", expect.objectContaining({ subDepartmentId: "sub-1" }))
    expect(m.timerCreate).toHaveBeenCalledWith({ data: { ticketId: "email-ticket", source: "mailbox", tenantId: "tenant-1", firstResponseStartedAt: new Date("2026-10-09T09:00:00Z"), resolutionStartedAt: new Date("2026-10-09T09:00:00Z") } })
    expect(m.rules).toHaveBeenCalledWith(
      expect.objectContaining({ id: "email-ticket", allowSla: false }),
      expect.objectContaining({ fromEmail: "customer@example.test" }),
    )
  })
  it("rejects duplicate delivery using the creation audit without creating another ticket", async () => {
    m.origin.mockResolvedValueOnce({ id: "existing-audit" })
    await expect(createTicketFromInboundEmail({
      departmentId: "dept-1", teamId: "sub-1", fromEmail: "customer@example.test",
      fromName: "Customer", subject: "Duplicate",
      inboundMessage: { providerMessageIds: ["email-1"], data: {
        providerMessageId: "email-1", direction: "inbound", bodyHtml: "Help",
        fromName: "Customer", fromEmail: "customer@example.test",
      } },
    })).rejects.toBeInstanceOf(DuplicateInboundEmailError)
    expect(m.create).not.toHaveBeenCalled()
    expect(m.message).not.toHaveBeenCalled()
    expect(m.arrival).not.toHaveBeenCalled()
  })

})

it("fails the creation transaction if applying its configured SLA fails", async () => {
  m.timerCreate.mockRejectedValueOnce(new Error("timer write failed"))
  await expect(createTicketFromInboundEmail({
    departmentId: "dept-1", teamId: "sub-1", fromEmail: "customer@example.test", fromName: "Customer", subject: "Test",
    inboundMessage: { providerMessageIds: ["new-email"], data: { providerMessageId: "new-email", direction: "inbound", bodyHtml: "Help", fromName: "Customer", fromEmail: "customer@example.test" } },
  })).rejects.toThrow("timer write failed")
  expect(m.rules).not.toHaveBeenCalled()
})

it("recognizes the message-only identity written by an older webhook", async () => {
  m.duplicate.mockResolvedValueOnce({ id: "legacy-message" })
  await expect(createTicketFromInboundEmail({ departmentId: "dept-1", teamId: "sub-1", fromEmail: "c@example.test", fromName: "Customer", subject: "Test", inboundMessage: { providerMessageIds: ["email-1"], data: { providerMessageId: "email-1", direction: "inbound", fromEmail: "c@example.test", fromName: "Customer", bodyHtml: "Help" } } })).rejects.toBeInstanceOf(DuplicateInboundEmailError)
  expect(m.create).not.toHaveBeenCalled()
  expect(m.arrival).not.toHaveBeenCalled()
})
it("normalizes the lock and receipt identity so bracketed and bare deliveries serialize", async () => {
  await createTicketFromInboundEmail({ departmentId: "dept-1", teamId: "sub-1", fromEmail: "c@example.test", fromName: "Customer", subject: "Test", inboundMessage: { providerMessageIds: ["message@example.test", "<message@example.test>"], data: { providerMessageId: "<message@example.test>", direction: "inbound", fromEmail: "c@example.test", fromName: "Customer", bodyHtml: "Help", rawPayload: { text: "Help", html: "<p>Help</p>", resendEmailId: "resend-1" } } } })
  expect(m.lock.mock.calls[0][1]).toBe("message@example.test")
  expect(m.message).toHaveBeenCalledWith({ data: expect.objectContaining({ providerMessageId: "message@example.test", bodyHtml: "", rawPayload: { mailboxReceipt: true, resendEmailId: "resend-1" } }) })
})

it("a message-only older processor sees the committed receipt and cannot create a second ticket", async () => {
  const stored: { receipt: { providerMessageId: string; status: string } | null } = { receipt: null }
  let releaseCommit!: () => void
  let signalLock!: () => void
  const committed = new Promise<void>((resolve) => { releaseCommit = resolve })
  const locked = new Promise<void>((resolve) => { signalLock = resolve })
  vi.mocked(prisma.$transaction).mockImplementationOnce((async (callback: (tx: unknown) => unknown) => {
    const result = await callback({
      $executeRaw: async () => { signalLock() },
      ticketMessage: { findFirst: async () => stored.receipt, create: async ({ data }: { data: { providerMessageId: string; status: string } }) => { stored.receipt = data; return { id: "receipt" } } },
      activityLog: { findFirst: m.origin, create: m.audit }, ticket: { create: m.create }, slaTimer: { create: m.timerCreate },
    })
    releaseCommit()
    return result
  }) as never)
  const modern = createTicketFromInboundEmail({ departmentId: "dept-1", teamId: "sub-1", fromEmail: "c@example.test", fromName: "Customer", subject: "Test", inboundMessage: { providerMessageIds: ["email-1"], data: { providerMessageId: "email-1", direction: "inbound", fromEmail: "c@example.test", fromName: "Customer", bodyHtml: "Help" } } })
  const olderMessageOnlyProcessor = (async () => {
    await locked
    await committed // models waiting for the same transaction advisory lock
    if (stored.receipt?.providerMessageId === "email-1") return "duplicate"
    await m.create({ data: { title: "Duplicate" } })
    return "created"
  })()
  const [, olderResult] = await Promise.all([modern, olderMessageOnlyProcessor])
  expect(olderResult).toBe("duplicate")
  expect(m.create).toHaveBeenCalledOnce()
  expect(m.arrival).toHaveBeenCalledOnce()
})
