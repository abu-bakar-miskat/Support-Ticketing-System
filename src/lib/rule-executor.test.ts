import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    rule: { findMany: vi.fn() },
    ruleExecutionLog: { createMany: vi.fn() },
    ticket: { update: vi.fn() },
    slaPolicy: { findFirst: vi.fn() },
    slaTimer: { upsert: vi.fn() },
  },
}))

vi.mock("@/lib/rota", () => ({
  getEligibleMembers: vi.fn(),
  isMemberAvailableNow: vi.fn(),
}))

vi.mock("@/lib/notify", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db"
import { getEligibleMembers, isMemberAvailableNow } from "@/lib/rota"
import { applyRulesToTicket } from "@/lib/rule-executor"

const mockRuleFindMany = vi.mocked(prisma.rule.findMany)
const mockLogCreateMany = vi.mocked(prisma.ruleExecutionLog.createMany)
const mockTicketUpdate = vi.mocked(prisma.ticket.update)
const mockAvailableNow = vi.mocked(isMemberAvailableNow)
const mockGetEligible = vi.mocked(getEligibleMembers)

const ticket = {
  id: "t1",
  tenantId: "ten1",
  departmentId: "d1",
  subDepartmentId: "sd1",
  assigneeId: "existing-assignee",
  formConfigId: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLogCreateMany.mockResolvedValue({ count: 0 } as never)
  mockTicketUpdate.mockResolvedValue({} as never)
})

describe("applyRulesToTicket — assign_agent availability (WH-03)", () => {
  it("assigns when the target agent is available now", async () => {
    mockRuleFindMany.mockResolvedValue([
      {
        id: "r1",
        name: "Assign Alice",
        order: 0,
        enabled: true,
        stopProcessing: false,
        conditions: { combinator: "AND", conditions: [] },
        actions: [{ type: "assign_agent", params: { agentId: "alice" } }],
      },
    ] as never)
    mockAvailableNow.mockResolvedValue(true)

    const result = await applyRulesToTicket(ticket, {})

    expect(result).toEqual({ assigned: true, firedCount: 1 })
    expect(mockAvailableNow).toHaveBeenCalledWith("alice", "sd1")
    expect(mockTicketUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { assigneeId: "alice" },
    })
  })

  it("skips assign_agent when the target is unavailable / off working hours", async () => {
    mockRuleFindMany.mockResolvedValue([
      {
        id: "r1",
        name: "Assign Alice",
        order: 0,
        enabled: true,
        stopProcessing: false,
        conditions: { combinator: "AND", conditions: [] },
        actions: [{ type: "assign_agent", params: { agentId: "alice" } }],
      },
    ] as never)
    mockAvailableNow.mockResolvedValue(false)

    const result = await applyRulesToTicket(ticket, {})

    expect(result).toEqual({ assigned: false, firedCount: 1 })
    expect(mockAvailableNow).toHaveBeenCalledWith("alice", "sd1")
    // Must not overwrite the assignment engine's existing assignee.
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("assign_group still picks only from currently eligible members", async () => {
    mockRuleFindMany.mockResolvedValue([
      {
        id: "r1",
        name: "Assign group",
        order: 0,
        enabled: true,
        stopProcessing: false,
        conditions: { combinator: "AND", conditions: [] },
        actions: [{ type: "assign_group", params: { subDepartmentId: "sd1" } }],
      },
    ] as never)
    mockGetEligible.mockResolvedValue([{ userId: "bob" }])

    const result = await applyRulesToTicket(ticket, {})

    expect(result).toEqual({ assigned: true, firedCount: 1 })
    expect(mockGetEligible).toHaveBeenCalledWith("sd1", "existing-assignee")
    expect(mockTicketUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { assigneeId: "bob" },
    })
  })
})


describe("applyRulesToTicket — SLA eligibility", () => {
  it.each([false, true])("allows SLA actions only for eligible tickets (allowSla: %s)", async allowSla => {
    const slaAction = { type: "apply_sla", params: { slaPolicyId: "sla-1" } }
    const priorityAction = { type: "set_priority", params: { priority: "High" } }
    mockRuleFindMany.mockResolvedValue([{
      id: "r1", name: "Set SLA and priority", order: 0, enabled: true, stopProcessing: false,
      conditions: { combinator: "AND", conditions: [] }, actions: [slaAction, priorityAction],
    }] as never)
    vi.mocked(prisma.slaPolicy.findFirst).mockResolvedValue({
      id: "sla-1", firstResponseMins: 30, resolutionMins: 120,
    } as never)
    vi.mocked(prisma.slaTimer.upsert).mockResolvedValue({} as never)

    // Intake callers omit allowSla and retain the existing default behavior.
    const result = await applyRulesToTicket(allowSla ? ticket : { ...ticket, allowSla: false }, {})

    expect(mockTicketUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { priority: "High" } })
    expect(result.firedCount).toBe(allowSla ? 2 : 1)
    expect(mockLogCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      actionsApplied: allowSla ? [slaAction, priorityAction] : [priorityAction],
    })] })
    if (allowSla) expect(prisma.slaTimer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ ticketId: "t1", policyId: "sla-1" }),
    }))
    else {
      expect(prisma.slaPolicy.findFirst).not.toHaveBeenCalled()
      expect(prisma.slaTimer.upsert).not.toHaveBeenCalled()
    }
  })
})
