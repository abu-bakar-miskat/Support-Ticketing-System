import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    intakeFormConfig: { findUnique: vi.fn() },
    mailboxConnection: { findUnique: vi.fn() },
    assignmentRule: { findMany: vi.fn() },
    profile: { findUnique: vi.fn() },
    subDepartmentMembership: { findUnique: vi.fn() },
    activityLog: { create: vi.fn() },
    departmentManager: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/rota", () => ({
  getEligibleMembers: vi.fn(),
  getOpenTicketCounts: vi.fn(),
  isMemberAvailableNow: vi.fn(),
}))

vi.mock("@/lib/notify", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/email", () => ({
  sendAssignmentFailedAlertEmail: vi.fn(() => Promise.resolve()),
}))

import { prisma } from "@/lib/db"
import { getEligibleMembers, getOpenTicketCounts, isMemberAvailableNow } from "@/lib/rota"
import { createNotification } from "@/lib/notify"
import { sendAssignmentFailedAlertEmail } from "@/lib/email"
import { autoAssignTicket, recordAssignmentFailure } from "./assignment-engine"

const mockDeptFind = vi.mocked(prisma.department.findUnique)
const mockSubDepartmentFind = vi.mocked(prisma.subDepartment.findUnique)
const mockFormFind = vi.mocked(prisma.intakeFormConfig.findUnique)
const mockRulesFindMany = vi.mocked(prisma.assignmentRule.findMany)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockMembershipFind = vi.mocked(prisma.subDepartmentMembership.findUnique)
const mockActivityCreate = vi.mocked(prisma.activityLog.create)
const mockDeptManagers = vi.mocked(prisma.departmentManager.findMany)
const mockGetEligible = vi.mocked(getEligibleMembers)
const mockGetCounts = vi.mocked(getOpenTicketCounts)
const mockAvailableNow = vi.mocked(isMemberAvailableNow)
const mockCreateNotification = vi.mocked(createNotification)
const mockSendEmail = vi.mocked(sendAssignmentFailedAlertEmail)

beforeEach(() => {
  vi.clearAllMocks()
  mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0 } as never)
  mockAvailableNow.mockResolvedValue(true)
})

describe("autoAssignTicket — ASG-01", () => {
  it.each(["ROUND_ROBIN", "WORKLOAD_BASED"])("%s: requests agents only for automatic assignment", async (method) => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: method, workloadThreshold: 5 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "agent" }])
    mockGetCounts.mockResolvedValue([{ userId: "agent", count: 8 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })

    expect(mockGetEligible).toHaveBeenCalledWith("t1", null, true)
    expect(result.assigneeId).toBe("agent")
    expect(result.failed).toBe(false)
  })

  it.each(["ROUND_ROBIN", "WORKLOAD_BASED"])("%s: leaves the ticket unassigned when no agents qualify", async (method) => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: method } as never)
    mockGetEligible.mockResolvedValue([])
    mockGetCounts.mockResolvedValue([])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })

    expect(mockGetEligible).toHaveBeenCalledWith("t1", null, true)
    expect(result).toEqual({ assigneeId: null, method, failed: true })
  })

  it("MANUAL: returns unassigned, not a failure", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("RULE_BASED: assigns when a rule matches and the target is an eligible subDepartment member", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind.mockResolvedValue({ isActive: true, doNotAssign: false } as never)

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "agent-1", method: "RULE_BASED", failed: false })
  })

  it("RULE_BASED: skips an unavailable matched agent and uses the next matching rule", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
      { id: "r2", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-2", enabled: true, order: 1 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind
      .mockResolvedValueOnce({ isActive: true, doNotAssign: false } as never)
      .mockResolvedValueOnce({ isActive: true, doNotAssign: false } as never)
    mockAvailableNow.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "agent-2", method: "RULE_BASED", failed: false })
  })

  it("RULE_BASED: falls back to available sub-department members when all matched agents are unavailable", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind.mockResolvedValue({ isActive: true, doNotAssign: false } as never)
    mockAvailableNow.mockResolvedValue(false)
    mockGetEligible.mockResolvedValue([{ userId: "available-a" }, { userId: "available-b" }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({
      assigneeId: "available-a",
      method: "RULE_BASED",
      failed: false,
      nextRotaPointer: 1,
    })
  })

  it("RULE_BASED: fails when no rule matches", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([] as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "RULE_BASED", failed: true })
  })

  it("ROUND_ROBIN: assigns via the pointer and reports nextRotaPointer", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 1 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "ROUND_ROBIN", failed: false, nextRotaPointer: 2 })
  })

  it("ROUND_ROBIN: fails when there is nobody eligible", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockGetEligible.mockResolvedValue([])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "ROUND_ROBIN", failed: true })
  })

  it("WORKLOAD_BASED: skips agents at/over the threshold in favor of one under it", async () => {
    // Default threshold 5: "a" is at capacity, so "b" (under it) gets the ticket.
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED", workloadThreshold: 5 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 5 }, { userId: "b", count: 1 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 0 })
  })

  it("WORKLOAD_BASED: round-robins among under-threshold agents from the rota pointer", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED", workloadThreshold: 5 } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 1 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 0 }, { userId: "b", count: 2 }, { userId: "c", count: 1 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    // pointer 1 → "b" is under threshold, so it wins; advance to 2.
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 2 })
  })

  it("WORKLOAD_BASED: falls back to the fewest open tickets when everyone is at/over the threshold", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED", workloadThreshold: 3 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 6 }, { userId: "b", count: 4 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 0 })
  })

  it("WORKLOAD_BASED: an override sub-department uses its own threshold over the department's", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN", workloadThreshold: 5 } as never)
    // Sub sets its own WORKLOAD_BASED with a tight threshold of 2.
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "WORKLOAD_BASED", workloadThreshold: 2 } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 3 }, { userId: "b", count: 1 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    // "a" is over the sub's threshold of 2, so "b" (under it) wins.
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 0 })
  })

  it("WORKLOAD_BASED: fails when there is nobody eligible", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED" } as never)
    mockGetEligible.mockResolvedValue([])
    mockGetCounts.mockResolvedValue([])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "WORKLOAD_BASED", failed: true })
  })

  it("MANUAL_SELECT: with one selected member, always assigns to that member", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "MANUAL_SELECT", manualAssigneeIds: ["b"] } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "MANUAL_SELECT", failed: false, nextRotaPointer: 0 })
  })

  it("MANUAL_SELECT: round-robins across the selected members via the pointer", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 1, assignmentMethod: "MANUAL_SELECT", manualAssigneeIds: ["a", "c"] } as never)
    // Eligible order is a, b, c; selected is {a, c} → filtered pool is [a, c].
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    // pointer 1 into a 2-member pool → index 1 = "c", advancing to 0.
    expect(result).toEqual({ assigneeId: "c", method: "MANUAL_SELECT", failed: false, nextRotaPointer: 0 })
  })

  it("MANUAL_SELECT: fails when no selected member is currently eligible", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "MANUAL_SELECT", manualAssigneeIds: ["z"] } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL_SELECT", failed: true })
  })

  it("defaults to ROUND_ROBIN when the department can't be loaded", async () => {
    mockDeptFind.mockResolvedValue(null as never)
    mockGetEligible.mockResolvedValue([{ userId: "solo" }])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result.method).toBe("ROUND_ROBIN")
    expect(result.assigneeId).toBe("solo")
  })

  it("sub-department override wins over the parent department's method", async () => {
    // Parent says ROUND_ROBIN; sub-department overrides to MANUAL.
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "MANUAL" } as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("inherits the parent department's method (and threshold) when the sub-department override is null", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED", workloadThreshold: 5 } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 3 }, { userId: "b", count: 0 }])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    // Both are under the inherited threshold of 5, so from pointer 0 "a" wins round-robin.
    expect(result).toEqual({ assigneeId: "a", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 1 })
  })

  it("RULE_BASED: queries rules scoped to the sub-department plus department-wide, sub-dept first", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind.mockResolvedValue({ isActive: true, doNotAssign: false } as never)

    await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })

    expect(mockRulesFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departmentId: "d1",
          enabled: true,
          OR: [
            { formConfigId: null, subDepartmentId: "t1" },
            { formConfigId: null, subDepartmentId: null },
          ],
        }),
        orderBy: [
          { formConfigId: { sort: "desc", nulls: "last" } },
          { subDepartmentId: { sort: "desc", nulls: "last" } },
          { order: "asc" },
        ],
      }),
    )
  })
})

describe("autoAssignTicket — form ↔ sub-department precedence", () => {
  it("no issue: the form's own method wins over the routed/default sub-department", async () => {
    // MANUAL form + ROUND_ROBIN sub-department, not issue-routed → stays MANUAL.
    mockFormFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "ROUND_ROBIN", manualAssigneeIds: [] } as never)
    const result = await autoAssignTicket({
      departmentId: "d1",
      teamId: "t1",
      formValues: {},
      excludeUserId: null,
      formConfigId: "f1",
      issueRouted: false,
    })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("issue-routed: the concerned sub-department's method wins over the form", async () => {
    // Same MANUAL form, but an issue chose this sub-department → ROUND_ROBIN wins.
    mockFormFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "ROUND_ROBIN", manualAssigneeIds: [] } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    const result = await autoAssignTicket({
      departmentId: "d1",
      teamId: "t1",
      formValues: {},
      excludeUserId: null,
      formConfigId: "f1",
      issueRouted: true,
    })
    expect(result).toEqual({ assigneeId: "a", method: "ROUND_ROBIN", failed: false, nextRotaPointer: 1 })
  })

  it("issue-routed with a sub-department that has no method: falls back to the form's method", async () => {
    mockFormFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null, manualAssigneeIds: [] } as never)
    const result = await autoAssignTicket({
      departmentId: "d1",
      teamId: "t1",
      formValues: {},
      excludeUserId: null,
      formConfigId: "f1",
      issueRouted: true,
    })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("no issue with a form that has no method: falls back to the sub-department's method", async () => {
    mockFormFind.mockResolvedValue({ assignmentMethod: null } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 1, assignmentMethod: "ROUND_ROBIN", manualAssigneeIds: [] } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }])
    const result = await autoAssignTicket({
      departmentId: "d1",
      teamId: "t1",
      formValues: {},
      excludeUserId: null,
      formConfigId: "f1",
      issueRouted: false,
    })
    expect(result).toEqual({ assigneeId: "b", method: "ROUND_ROBIN", failed: false, nextRotaPointer: 2 })
  })

  it("mailbox method always wins over both form and sub-department", async () => {
    mockFormFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    mockSubDepartmentFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "ROUND_ROBIN", manualAssigneeIds: [] } as never)
    const mockMailboxFind = vi.mocked(prisma.mailboxConnection.findUnique)
    mockMailboxFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED", manualAssigneeIds: [] } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    // "a" is at the default capacity of 5, so the mailbox's workload method sends
    // the ticket to "b" — the point being the mailbox method wins outright.
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 5 }, { userId: "b", count: 1 }])
    const result = await autoAssignTicket({
      departmentId: "d1",
      teamId: "t1",
      formValues: {},
      excludeUserId: null,
      formConfigId: "f1",
      mailboxConnectionId: "mb1",
      issueRouted: false,
    })
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false, nextRotaPointer: 0 })
  })
})

describe("recordAssignmentFailure — ASG-02/03", () => {
  it("writes an ASSIGNMENT_FAILED activity log and notifies every department manager", async () => {
    mockDeptManagers.mockResolvedValue([
      { user: { id: "mgr-1", name: "Manager One", email: "mgr1@example.com" } },
      { user: { id: "mgr-2", name: "Manager Two", email: "mgr2@example.com" } },
    ] as never)

    await recordAssignmentFailure("ticket-1", "dept-1", "actor-1", "Broken widget", "SUP-42")

    expect(mockActivityCreate).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", actorId: "actor-1", action: "ASSIGNMENT_FAILED", metadata: { departmentId: "dept-1" } },
    })
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "mgr-1", type: "assignment_failed_alert", ticketId: "ticket-1" }),
    )
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "mgr1@example.com", managerId: "mgr-1", humanId: "SUP-42", ticketTitle: "Broken widget" }),
    )
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })

  it("never throws even if the DB call fails", async () => {
    mockActivityCreate.mockRejectedValue(new Error("db down"))
    await expect(
      recordAssignmentFailure("ticket-1", "dept-1", "actor-1", "Title", "SUP-1"),
    ).resolves.toBeUndefined()
  })
})
