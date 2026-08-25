import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
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
}))

vi.mock("@/lib/notify", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/email", () => ({
  sendAssignmentFailedAlertEmail: vi.fn(() => Promise.resolve()),
}))

import { prisma } from "@/lib/db"
import { getEligibleMembers, getOpenTicketCounts } from "@/lib/rota"
import { createNotification } from "@/lib/notify"
import { sendAssignmentFailedAlertEmail } from "@/lib/email"
import { autoAssignTicket, recordAssignmentFailure } from "./assignment-engine"

const mockDeptFind = vi.mocked(prisma.department.findUnique)
const mockTeamFind = vi.mocked(prisma.subDepartment.findUnique)
const mockRulesFindMany = vi.mocked(prisma.assignmentRule.findMany)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockMembershipFind = vi.mocked(prisma.subDepartmentMembership.findUnique)
const mockActivityCreate = vi.mocked(prisma.activityLog.create)
const mockDeptManagers = vi.mocked(prisma.departmentManager.findMany)
const mockGetEligible = vi.mocked(getEligibleMembers)
const mockGetCounts = vi.mocked(getOpenTicketCounts)
const mockCreateNotification = vi.mocked(createNotification)
const mockSendEmail = vi.mocked(sendAssignmentFailedAlertEmail)

beforeEach(() => {
  vi.clearAllMocks()
  mockTeamFind.mockResolvedValue({ rotaPointer: 0 } as never)
})

describe("autoAssignTicket — ASG-01", () => {
  it("MANUAL: returns unassigned, not a failure", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "MANUAL" } as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("RULE_BASED: assigns when a rule matches and the target is an eligible team member", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind.mockResolvedValue({ isActive: true, doNotAssign: false } as never)

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "agent-1", method: "RULE_BASED", failed: false })
  })

  it("RULE_BASED: fails when the matched agent is no longer an eligible team member", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([
      { id: "r1", conditions: { combinator: "AND", conditions: [] }, agentId: "agent-1", enabled: true, order: 0 },
    ] as never)
    mockProfileFind.mockResolvedValue({ isActive: true } as never)
    mockMembershipFind.mockResolvedValue({ isActive: false, doNotAssign: false } as never)

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "RULE_BASED", failed: true })
  })

  it("RULE_BASED: fails when no rule matches", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockRulesFindMany.mockResolvedValue([] as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "RULE_BASED", failed: true })
  })

  it("ROUND_ROBIN: assigns via the pointer and reports nextRotaPointer", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "ROUND_ROBIN" } as never)
    mockTeamFind.mockResolvedValue({ rotaPointer: 1 } as never)
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

  it("WORKLOAD_BASED: assigns to the lowest open-ticket count", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED" } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 5 }, { userId: "b", count: 1 }])

    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false })
  })

  it("WORKLOAD_BASED: fails when there is nobody eligible", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED" } as never)
    mockGetEligible.mockResolvedValue([])
    mockGetCounts.mockResolvedValue([])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "WORKLOAD_BASED", failed: true })
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
    mockTeamFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: "MANUAL" } as never)
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: null, method: "MANUAL", failed: false })
  })

  it("inherits the parent department's method when the sub-department override is null", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "WORKLOAD_BASED" } as never)
    mockTeamFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null } as never)
    mockGetEligible.mockResolvedValue([{ userId: "a" }, { userId: "b" }])
    mockGetCounts.mockResolvedValue([{ userId: "a", count: 3 }, { userId: "b", count: 0 }])
    const result = await autoAssignTicket({ departmentId: "d1", teamId: "t1", formValues: {}, excludeUserId: null })
    expect(result).toEqual({ assigneeId: "b", method: "WORKLOAD_BASED", failed: false })
  })

  it("RULE_BASED: queries rules scoped to the sub-department plus department-wide, sub-dept first", async () => {
    mockDeptFind.mockResolvedValue({ assignmentMethod: "RULE_BASED" } as never)
    mockTeamFind.mockResolvedValue({ rotaPointer: 0, assignmentMethod: null } as never)
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
          OR: [{ subDepartmentId: "t1" }, { subDepartmentId: null }],
        }),
        orderBy: [{ subDepartmentId: { sort: "desc", nulls: "last" } }, { order: "asc" }],
      }),
    )
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
