import { describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  sla: vi.fn(), mailboxSla: vi.fn().mockResolvedValue(undefined), rules: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ id: "email-ticket", ticketNumber: 12 }),
  message: vi.fn().mockResolvedValue({ id: "message-1" }),
}))
vi.mock("@/lib/db", () => ({ prisma: {
  subDepartment: { findUniqueOrThrow: vi.fn().mockResolvedValue({ tenantId: "tenant-1", prefix: "SUP" }) },
  departmentManager: { findFirst: vi.fn().mockResolvedValue(null) },
  $transaction: vi.fn(async callback => callback({
    $executeRaw: vi.fn().mockResolvedValue(1),
    ticketMessage: { findFirst: vi.fn().mockResolvedValue(null), create: m.message },
    ticket: { create: m.create }, activityLog: { create: vi.fn().mockResolvedValue({}) },
  })),
} }))
vi.mock("@/lib/assignment-engine", () => ({
  autoAssignTicket: vi.fn().mockResolvedValue({ assigneeId: null }), recordAssignmentFailure: vi.fn(),
}))
vi.mock("@/lib/board-data", () => ({ getSubDepartmentStatuses: vi.fn().mockResolvedValue([{ label: "To Do" }]) }))
vi.mock("@/lib/support-project", () => ({ resolveSupportProjectForDepartment: vi.fn().mockResolvedValue("support-project") }))
vi.mock("@/lib/intake-conversion", () => ({ ensureSystemUser: vi.fn().mockResolvedValue("system-user") }))
vi.mock("@/lib/ensure-project-members", () => ({ ensureProjectMembers: vi.fn() }))
vi.mock("@/lib/sla-engine", () => ({ startSlaTimers: m.sla, startMailboxSlaTimer: m.mailboxSla }))
vi.mock("@/lib/rule-executor", () => ({ applyRulesToTicket: m.rules }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendAssignmentEmail: vi.fn() }))
vi.mock("@/lib/department-setup", () => ({ assertDepartmentOperational: vi.fn().mockResolvedValue({ ok: true }) }))

import { createTicketFromInboundEmail } from "./mailbox-ticket-creation"

describe("mailbox ticket SLA policy", () => {
  it("starts only the department mailbox SLA (no form policies) and disables SLA rules", async () => {
    const ticket = await createTicketFromInboundEmail({
      departmentId: "dept-1", teamId: "sub-1", fromEmail: "customer@example.test",
      fromName: "Customer", subject: "Email request",
      inboundMessage: { providerMessageIds: ["email-1"], data: {
        providerMessageId: "email-1", direction: "inbound", bodyHtml: "<p>Help</p>",
        fromName: "Customer", fromEmail: "customer@example.test",
      } },
    })
    expect(ticket.id).toBe("email-ticket")
    expect(m.create).toHaveBeenCalledOnce()
    expect(m.message).toHaveBeenCalledOnce()
    expect(m.sla).not.toHaveBeenCalled()
    expect(m.mailboxSla).toHaveBeenCalledWith("email-ticket", "tenant-1", "dept-1")
    expect(m.rules).toHaveBeenCalledWith(
      expect.objectContaining({ id: "email-ticket", allowSla: false }),
      expect.objectContaining({ fromEmail: "customer@example.test" }),
    )
  })
})
