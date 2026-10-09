vi.mock("@/lib/ticket-escalation", () => ({ escalateTicket: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/manual-resolution", () => ({
  finalizeManualResolution: vi.fn().mockResolvedValue(undefined),
  manualTicketWhere: {},
}))
vi.mock("@/lib/time-estimate-notify", () => ({ checkAndNotifyEstimateOverrun: vi.fn().mockResolvedValue(undefined) }))
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    slaPolicy: { findMany: vi.fn(), findFirst: vi.fn() },
    ticket: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    slaTimer: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    slaBreach: { create: vi.fn(), findMany: vi.fn() },
    ticketMessage: { findMany: vi.fn() },
    timeEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    memberSchedule: { findUnique: vi.fn() },
    memberHoliday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    departmentManager: { findMany: vi.fn() },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    mailboxConnection: { findFirst: vi.fn().mockResolvedValue(null) },
    activityLog: { findMany: vi.fn().mockResolvedValue([]) },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/portal-conversation", () => ({
  loadPortalConversation: async () => [],
}))

vi.mock("@/lib/notify", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}))

import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import {
  sweepSlaChecks,
  prepareMailboxSla,
  stopMailboxFirstResponseOnActiveStatus,
  startMailboxResolutionOnWork,
  startSlaTimers,
  startMailboxSlaTimer,
  stopFirstResponseOnPublicAgentMessage,
  syncResolutionTimerOnClosedAtChange,
  resolveCalendarForTicket,
  checkAndNotifySla,
  getSlaIndicatorForTicket,
  getSlaIndicatorViewForTicket,
} from "./sla-engine"

const mockDeptFind = vi.mocked(prisma.department.findUnique)
const mockPolicyFindMany = vi.mocked(prisma.slaPolicy.findMany)
const mockPolicyFindFirst = vi.mocked(prisma.slaPolicy.findFirst)
const mockTimerCreate = vi.mocked(prisma.slaTimer.create)
const mockTimerFind = vi.mocked(prisma.slaTimer.findUnique)
const mockTimerUpdate = vi.mocked(prisma.slaTimer.update)
const mockTimerUpdateMany = vi.mocked(prisma.slaTimer.updateMany)
const mockBreachCreate = vi.mocked(prisma.slaBreach.create)
const mockTicketMessages = vi.mocked(prisma.ticketMessage.findMany)
const mockScheduleFind = vi.mocked(prisma.memberSchedule.findUnique)
const mockMemberHolidays = vi.mocked(prisma.memberHoliday.findMany)
const mockDeptHolidays = vi.mocked(prisma.departmentHoliday.findMany)
const mockDeptManagers = vi.mocked(prisma.departmentManager.findMany)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockCreateNotification = vi.mocked(createNotification)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => typeof ops === "function" ? ops(prisma) : Promise.all(ops as Promise<unknown>[]) as never)
  mockTimerUpdateMany.mockResolvedValue({ count: 1 })
  mockDeptHolidays.mockResolvedValue([])
  mockPolicyFindMany.mockResolvedValue([])
  mockTicketMessages.mockResolvedValue([] as never)
  vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue(null)
})

describe("startSlaTimers — SLA-01/02/03", () => {
  it("creates a timer with the matched policy's targets", async () => {
    mockPolicyFindMany.mockResolvedValue([
      { id: "p1", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 30, resolutionMins: 240 },
    ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {}, now)

    expect(mockTimerCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        tenantId: "tenant-1",
        policyId: "p1",
        firstResponseTargetMins: 30,
        resolutionTargetMins: 240,
        firstResponseStartedAt: now,
        resolutionStartedAt: now,
      },
    })
  })

  it("does not create a timer when no policy matches", async () => {
    mockPolicyFindMany.mockResolvedValue([
      {
        id: "p1",
        conditions: { combinator: "AND", conditions: [{ fieldId: "x", operator: "equals", value: "y" }] },
        firstResponseMins: 30,
        resolutionMins: 240,
      },
    ] as never)

    await startSlaTimers("ticket-1", "tenant-1", "dept-1", { x: "z" })
    expect(mockTimerCreate).not.toHaveBeenCalled()
  })

  it("swallows errors so ticket creation is never blocked", async () => {
    mockPolicyFindMany.mockRejectedValue(new Error("db down"))
    await expect(startSlaTimers("ticket-1", "tenant-1", "dept-1", {})).resolves.toBeUndefined()
  })

  it("uses preferredPolicyId targets when the intake issue policy is enabled", async () => {
    mockPolicyFindFirst.mockResolvedValue({
      id: "issue-1",
      firstResponseMins: 15,
      resolutionMins: 120,
    } as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", { priority: "High" }, now, null, "issue-1")

    expect(mockPolicyFindFirst).toHaveBeenCalled()
    expect(mockPolicyFindMany).not.toHaveBeenCalled()
    expect(mockTimerCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        tenantId: "tenant-1",
        policyId: "issue-1",
        firstResponseTargetMins: 15,
        resolutionTargetMins: 120,
        firstResponseStartedAt: now,
        resolutionStartedAt: now,
      },
    })
  })

  it("uses the department's own policies and does not fall back to tenant defaults", async () => {
    // Department has an enabled policy → override active. Only the dept query runs.
    mockPolicyFindMany.mockResolvedValueOnce([
      { id: "dept-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 30, resolutionMins: 240 },
    ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {}, now)

    expect(mockPolicyFindMany).toHaveBeenCalledTimes(1)
    expect(mockPolicyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentId: "dept-1", subDepartmentId: null, enabled: true } }),
    )
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyId: "dept-p", firstResponseTargetMins: 30, resolutionTargetMins: 240 }),
      }),
    )
  })

  it("falls back to tenant-level defaults when the department has no policies", async () => {
    // Dept query returns nothing → tenant-level (departmentId: null) query runs.
    mockPolicyFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: "tenant-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 90, resolutionMins: 600 },
      ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {}, now)

    expect(mockPolicyFindMany).toHaveBeenCalledTimes(2)
    expect(mockPolicyFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { tenantId: "tenant-1", departmentId: null, enabled: true } }),
    )
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyId: "tenant-p", firstResponseTargetMins: 90, resolutionTargetMins: 600 }),
      }),
    )
  })

  it("creates no timer when neither department nor tenant defaults exist", async () => {
    mockPolicyFindMany.mockResolvedValue([] as never)
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {})
    expect(mockTimerCreate).not.toHaveBeenCalled()
  })

  it("falls back to condition matching when preferredPolicyId is missing or disabled", async () => {
    mockPolicyFindFirst.mockResolvedValue(null as never)
    mockPolicyFindMany.mockResolvedValue([
      {
        id: "p-high",
        conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "High" }] },
        firstResponseMins: 60,
        resolutionMins: 240,
      },
    ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    await startSlaTimers("ticket-1", "tenant-1", "dept-1", { priority: "High" }, new Date(), null, "gone")

    expect(mockPolicyFindMany).toHaveBeenCalled()
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policyId: "p-high",
          firstResponseTargetMins: 60,
          resolutionTargetMins: 240,
        }),
      }),
    )
  })

  it("uses the sub-department's own policy over the department-wide one", async () => {
    // Tier 1: the ticket's sub-department has a matching policy → its targets win
    // over the department-level tier that is also queried.
    mockPolicyFindMany
      .mockResolvedValueOnce([
        { id: "sub-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 10, resolutionMins: 60 },
      ] as never)
      .mockResolvedValueOnce([
        { id: "dept-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 30, resolutionMins: 240 },
      ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {}, now, "team-1")

    expect(mockPolicyFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { departmentId: "dept-1", subDepartmentId: "team-1", enabled: true } }),
    )
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyId: "sub-p", firstResponseTargetMins: 10, resolutionTargetMins: 60 }),
      }),
    )
  })

  it("falls back to the department SLA when the sub-department has no policy", async () => {
    // Tier 1 empty → tier 2 (department-level) is used.
    mockPolicyFindMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: "dept-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 30, resolutionMins: 240 },
      ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", {}, now, "team-1")

    expect(mockPolicyFindMany).toHaveBeenCalledTimes(2)
    expect(mockPolicyFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { departmentId: "dept-1", subDepartmentId: null, enabled: true } }),
    )
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyId: "dept-p", firstResponseTargetMins: 30, resolutionTargetMins: 240 }),
      }),
    )
  })

  it("falls back to the department SLA when the sub-department's policy does not match the ticket", async () => {
    // Tier 1 has a policy, but its conditions don't match → fall through to the
    // department-level tier (user-chosen fallback behaviour).
    mockPolicyFindMany
      .mockResolvedValueOnce([
        {
          id: "sub-p",
          conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
          firstResponseMins: 10,
          resolutionMins: 60,
        },
      ] as never)
      .mockResolvedValueOnce([
        { id: "dept-p", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 30, resolutionMins: 240 },
      ] as never)
    mockTimerCreate.mockResolvedValue({} as never)

    const now = new Date("2026-08-17T09:00:00.000Z")
    await startSlaTimers("ticket-1", "tenant-1", "dept-1", { priority: "Low" }, now, "team-1")

    expect(mockPolicyFindMany).toHaveBeenCalledTimes(2)
    expect(mockTimerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyId: "dept-p", firstResponseTargetMins: 30, resolutionTargetMins: 240 }),
      }),
    )
  })
})

describe("stopFirstResponseOnPublicAgentMessage — SLA-03", () => {
  it("stops only if not already stopped (idempotent updateMany)", async () => {
    mockTimerUpdateMany.mockResolvedValue({ count: 1 } as never)
    const at = new Date("2026-08-17T10:00:00.000Z")
    await stopFirstResponseOnPublicAgentMessage("ticket-1", at)
    expect(mockTimerUpdateMany).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1", firstResponseStoppedAt: null },
      data: { firstResponseStoppedAt: at },
    })
  })
})

describe("syncResolutionTimerOnClosedAtChange — resolve + OQ-03 reopen", () => {
  it("stops the resolution timer when closedAt is set and not already stopped", async () => {
    mockTimerFind.mockResolvedValue({
      resolutionStartedAt: new Date("2026-08-10T00:00:00.000Z"),
      resolutionStoppedAt: null,
    } as never)
    const closedAt = new Date("2026-08-17T00:00:00.000Z")
    await syncResolutionTimerOnClosedAtChange("ticket-1", closedAt)
    expect(mockTimerUpdate).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1" },
      data: { resolutionStoppedAt: closedAt },
    })
  })

  it("does nothing when the resolution timer is already stopped", async () => {
    mockTimerFind.mockResolvedValue({
      resolutionStartedAt: new Date("2026-08-10T00:00:00.000Z"),
      resolutionStoppedAt: new Date("2026-08-16T00:00:00.000Z"),
    } as never)
    await syncResolutionTimerOnClosedAtChange("ticket-1", new Date("2026-08-17T00:00:00.000Z"))
    expect(mockTimerUpdate).not.toHaveBeenCalled()
  })

  it("resumes + starts a fresh first-response cycle on reopen (closedAt cleared)", async () => {
    mockTimerFind.mockResolvedValue({
      resolutionStartedAt: new Date("2026-08-10T00:00:00.000Z"),
      resolutionStoppedAt: new Date("2026-08-12T00:00:00.000Z"),
    } as never)
    await syncResolutionTimerOnClosedAtChange("ticket-1", null)
    expect(mockTimerUpdate).toHaveBeenCalledTimes(1)
    const call = mockTimerUpdate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.firstResponseStoppedAt).toBeNull()
    expect(call.data.resolutionStoppedAt).toBeNull()
    expect(call.data.resolutionStartedAt).toBeInstanceOf(Date)
    // Shifted forward past 2026-08-10 (the original start) since it resumed.
    expect((call.data.resolutionStartedAt as Date).getTime()).toBeGreaterThan(new Date("2026-08-10T00:00:00.000Z").getTime())
  })

  it("does nothing when the ticket has no SLA timer", async () => {
    mockTimerFind.mockResolvedValue(null as never)
    await syncResolutionTimerOnClosedAtChange("ticket-1", new Date())
    expect(mockTimerUpdate).not.toHaveBeenCalled()
  })
})

describe("resolveCalendarForTicket — SLA-04/WH-05", () => {
  it("returns null when the department does not pause outside hours", async () => {
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: false }, businessHours: null } as never)
    const result = await resolveCalendarForTicket(
      { departmentId: "dept-1", assigneeId: "user-1" },
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-17T00:00:00.000Z"),
    )
    expect(result).toBeNull()
  })

  it("uses the assignee's MemberSchedule + MemberHoliday when present", async () => {
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: true }, businessHours: null } as never)
    mockScheduleFind.mockResolvedValue({
      workingDays: [1, 2, 3, 4, 5],
      workStartTime: "09:00",
      workEndTime: "17:00",
    } as never)
    mockProfileFind.mockResolvedValue({ timezone: "Asia/Dhaka" } as never)
    mockMemberHolidays.mockResolvedValue([{ date: new Date("2026-08-12T00:00:00.000Z") }] as never)

    const result = await resolveCalendarForTicket(
      { departmentId: "dept-1", assigneeId: "user-1" },
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-17T00:00:00.000Z"),
    )
    expect(result).toEqual({
      timezone: "Asia/Dhaka",
      workingDays: [1, 2, 3, 4, 5],
      workStartTime: "09:00",
      workEndTime: "17:00",
      holidays: [{ start: "2026-08-12", end: "2026-08-12" }],
    })
  })

  it("falls back to the department's business calendar when the assignee has no schedule", async () => {
    mockDeptFind.mockResolvedValue({
      slaConfig: { pauseOutsideHours: true },
      businessHours: { timezone: "UTC", workingDays: [1, 2, 3, 4, 5], workStartTime: "08:00", workEndTime: "16:00" },
    } as never)
    mockScheduleFind.mockResolvedValue(null as never)
    mockDeptHolidays.mockResolvedValue([
      { startDate: new Date("2026-08-14T00:00:00.000Z"), endDate: new Date("2026-08-14T00:00:00.000Z") },
    ] as never)

    const result = await resolveCalendarForTicket(
      { departmentId: "dept-1", assigneeId: null },
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-17T00:00:00.000Z"),
    )
    expect(result).toEqual({
      timezone: "UTC",
      workingDays: [1, 2, 3, 4, 5],
      workStartTime: "08:00",
      workEndTime: "16:00",
      holidays: [{ start: "2026-08-14", end: "2026-08-14" }],
    })
  })

  it("falls back to sane UTC 9-5 defaults when the department has no businessHours configured", async () => {
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: true }, businessHours: null } as never)
    mockScheduleFind.mockResolvedValue(null as never)
    mockDeptHolidays.mockResolvedValue([] as never)

    const result = await resolveCalendarForTicket(
      { departmentId: "dept-1", assigneeId: null },
      new Date("2026-08-10T00:00:00.000Z"),
      new Date("2026-08-17T00:00:00.000Z"),
    )
    expect(result).toEqual({
      timezone: "UTC",
      workingDays: [1, 2, 3, 4, 5],
      workStartTime: "09:00",
      workEndTime: "17:00",
      holidays: [],
    })
  })
})

describe("checkAndNotifySla — SLA-05/06/07", () => {
  const ticketRelation = {
    intake: { id: "intake-1" },
    activityLogs: [],
    id: "ticket-1",
    assigneeId: "assignee-1",
    subDepartmentId: "team-1",
    subDepartment: { departmentId: "dept-1" },
  }

  it("notifies at-risk once and stamps the flag (no calendar pausing)", async () => {
    const now = new Date("2026-08-17T09:48:00.000Z") // 48 of 60 target mins = 80% = AT_RISK
    mockTimerFind.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-1",
      firstResponseTargetMins: 60,
      resolutionTargetMins: 480,
      firstResponseStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      firstResponseStoppedAt: null,
      resolutionStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      resolutionStoppedAt: null,
      firstResponseAtRiskNotifiedAt: null,
      firstResponseBreachNotifiedAt: null,
      resolutionAtRiskNotifiedAt: null,
      resolutionBreachNotifiedAt: null,
      ticket: ticketRelation,
    } as never)
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: false } } as never)
    mockDeptManagers.mockResolvedValue([{ userId: "manager-1" }] as never)

    await checkAndNotifySla("ticket-1", now)

    expect(mockTimerUpdateMany).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1", firstResponseAtRiskNotifiedAt: null, firstResponseStoppedAt: null },
      data: { firstResponseAtRiskNotifiedAt: now },
    })
    expect(mockBreachCreate).not.toHaveBeenCalled()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "assignee-1", type: "sla_at_risk", ticketId: "ticket-1" }),
    )
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "manager-1", type: "sla_at_risk" }),
    )
  })

  it("records an immutable SlaBreach row and notifies once on breach", async () => {
    const now = new Date("2026-08-17T10:05:00.000Z") // 65 of 60 target mins = BREACHED
    mockTimerFind.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-1",
      firstResponseTargetMins: 60,
      resolutionTargetMins: 480,
      firstResponseStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      firstResponseStoppedAt: null,
      resolutionStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      resolutionStoppedAt: null,
      firstResponseAtRiskNotifiedAt: new Date("2026-08-17T09:48:00.000Z"),
      firstResponseBreachNotifiedAt: null,
      resolutionAtRiskNotifiedAt: null,
      resolutionBreachNotifiedAt: null,
      ticket: ticketRelation,
    } as never)
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: false } } as never)
    mockDeptManagers.mockResolvedValue([] as never)

    await checkAndNotifySla("ticket-1", now)

    expect(mockBreachCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        tenantId: "tenant-1",
        timerId: "timer-1",
        metric: "first_response",
        targetMins: 60,
        breachedAt: now,
      },
    })
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sla_breach", recipientId: "assignee-1" }),
    )
  })

  it("notifies assignee + managers with a resolution-specific message on resolution breach", async () => {
    const now = new Date("2026-08-17T10:05:00.000Z") // 65 of 12 target mins = BREACHED
    mockTimerFind.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-1",
      firstResponseTargetMins: 6,
      resolutionTargetMins: 12,
      firstResponseStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      firstResponseStoppedAt: new Date("2026-08-17T09:03:00.000Z"), // already answered, on-track
      resolutionStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      resolutionStoppedAt: null,
      firstResponseAtRiskNotifiedAt: null,
      firstResponseBreachNotifiedAt: null,
      resolutionAtRiskNotifiedAt: null,
      resolutionBreachNotifiedAt: null,
      ticket: ticketRelation,
    } as never)
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: false } } as never)
    mockDeptManagers.mockResolvedValue([{ userId: "manager-1" }] as never)

    await checkAndNotifySla("ticket-1", now)

    expect(mockBreachCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        tenantId: "tenant-1",
        timerId: "timer-1",
        metric: "resolution",
        targetMins: 12,
        breachedAt: now,
      },
    })
    // Notification only — the ticket must NOT be auto-escalated.
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "assignee-1",
        type: "sla_breach",
        ticketId: "ticket-1",
        message: "exceeded its Time to Resolution SLA",
      }),
    )
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "manager-1",
        type: "sla_breach",
        message: "exceeded its Time to Resolution SLA",
      }),
    )
  })

  it("does not re-notify once a threshold has already been flagged", async () => {
    const now = new Date("2026-08-17T09:48:00.000Z")
    mockTimerFind.mockResolvedValue({
      id: "timer-1",
      tenantId: "tenant-1",
      firstResponseTargetMins: 60,
      resolutionTargetMins: 480,
      firstResponseStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      firstResponseStoppedAt: null,
      resolutionStartedAt: new Date("2026-08-17T09:00:00.000Z"),
      resolutionStoppedAt: null,
      firstResponseAtRiskNotifiedAt: new Date("2026-08-17T09:48:00.000Z"), // already flagged
      firstResponseBreachNotifiedAt: null,
      resolutionAtRiskNotifiedAt: null,
      resolutionBreachNotifiedAt: null,
      ticket: ticketRelation,
    } as never)
    mockDeptFind.mockResolvedValue({ slaConfig: { pauseOutsideHours: false } } as never)

    await checkAndNotifySla("ticket-1", now)

    expect(mockTimerUpdate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})


describe("existing manual and mailbox tickets — no SLA", () => {
  it.each([{ activityLogs: [] }, { activityLogs: [{ id: "email-creation" }] }])("ignores legacy manual and mailbox timers: %j", async ({ activityLogs }) => {
    mockTimerFind.mockResolvedValue({
      id: "legacy-timer",
      ticket: { intake: null, activityLogs, assigneeId: "agent-1",
        subDepartmentId: "sub-1", subDepartment: { departmentId: "dept-1" } },
    } as never)

    expect(await getSlaIndicatorForTicket("manual-1")).toBeNull()
    expect(await getSlaIndicatorViewForTicket("manual-1")).toBeNull()
    await checkAndNotifySla("manual-1")
    expect(mockDeptFind).not.toHaveBeenCalled()
    expect(mockTimerUpdate).not.toHaveBeenCalled()
    expect(mockBreachCreate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it("continues evaluating form-submitted ticket timers", async () => {
    mockTimerFind.mockResolvedValue({
      id: "timer-1", ticketId: "intake-1",
      firstResponseTargetMins: 60, resolutionTargetMins: 480,
      firstResponseStartedAt: new Date("2026-10-07T09:00:00Z"), firstResponseStoppedAt: null,
      resolutionStartedAt: new Date("2026-10-07T09:00:00Z"), resolutionStoppedAt: null,
      ticket: { intake: { id: "intake-1" }, assigneeId: null, subDepartmentId: "sub-1",
        subDepartment: { departmentId: "dept-1" } },
    } as never)
    vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue({
      slaConfig: { pauseOutsideHours: false }, businessHours: {},
    } as never)
    expect(await getSlaIndicatorViewForTicket("intake-1", new Date("2026-10-07T09:10:00Z")))
      .toMatchObject({ overall: "ON_TRACK" })
  })
})

describe("shared-mailbox SLA", () => {
  it("starts a mailbox-sourced timer from the department's mailbox targets", async () => {
    const now = new Date("2026-10-09T09:00:00Z")
    mockDeptFind.mockResolvedValue({ mailboxFirstResponseMins: 30, mailboxResolutionMins: 240 } as never)

    await startMailboxSlaTimer("email-1", "tenant-1", "dept-1", now)

    expect(mockTimerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticketId: "email-1", tenantId: "tenant-1", source: "mailbox",
        firstResponseTargetMins: 30, resolutionTargetMins: 240,
        firstResponseStartedAt: now, resolutionStartedAt: now,
      }),
    }))
    expect(mockPolicyFindMany).not.toHaveBeenCalled()
  })

  it("does nothing when the department has no mailbox SLA", async () => {
    mockDeptFind.mockResolvedValue({ mailboxFirstResponseMins: null, mailboxResolutionMins: null } as never)
    await startMailboxSlaTimer("email-1", "tenant-1", "dept-1")
    expect(mockTimerCreate).not.toHaveBeenCalled()
  })

  it("evaluates mailbox-sourced timers on tickets without an intake", async () => {
    mockTimerFind.mockResolvedValue({
      id: "timer-m", ticketId: "email-1", source: "mailbox", policy: null,
      firstResponseTargetMins: 60, resolutionTargetMins: 480,
      firstResponseStartedAt: new Date("2026-10-09T09:00:00Z"), firstResponseStoppedAt: null,
      resolutionStartedAt: new Date("2026-10-09T09:00:00Z"), resolutionStoppedAt: null,
      ticket: { intake: null, assigneeId: null, subDepartmentId: "sub-1",
        subDepartment: { departmentId: "dept-1" } },
    } as never)
    vi.mocked(prisma.subDepartment.findUnique).mockResolvedValue({
      slaConfig: { pauseOutsideHours: false }, businessHours: {},
    } as never)
    expect(await getSlaIndicatorViewForTicket("email-1", new Date("2026-10-09T09:10:00Z")))
      .toMatchObject({ overall: "ON_TRACK" })
  })
})


describe("manual work in SLA sweep", () => {
  it("checks estimated manual work even when no SlaTimer exists", async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValueOnce([{ id: "manual-1" }] as never)
    const now = new Date("2026-10-09T12:00:00Z")
    expect(await sweepSlaChecks(now)).toBe(1)
    const { checkAndNotifyEstimateOverrun } = await import("@/lib/time-estimate-notify")
    expect(checkAndNotifyEstimateOverrun).toHaveBeenCalledWith("manual-1", now)
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ closedAt: null, estimateOverrunNotifiedAt: null, estimatedTime: { gt: 0 } }),
    }))
  })
})


describe("Stage 2 mailbox lifecycle", () => {
  const start = new Date("2026-10-09T09:00:00Z")
  const snapshot = {
    calendar: { timezone: "UTC", workingDays: [1, 2, 3, 4, 5], workStartTime: "09:00", workEndTime: "17:00", holidays: [] },
    resolutionActivatedAt: start.toISOString(), atRiskPct: 50, activeStatuses: ["In Progress", "Investigating"], targetSource: "mailbox",
  }
  const mailboxTimer = (overrides = {}) => ({
    id: "mailbox-timer", ticketId: "mailbox-1", tenantId: "tenant-1", source: "mailbox", mailboxConfig: snapshot,
    firstResponseTargetMins: 60, resolutionTargetMins: 120,
    firstResponseStartedAt: start, resolutionStartedAt: start,
    firstResponseStoppedAt: null, resolutionStoppedAt: null,
    firstResponseAtRiskNotifiedAt: null, firstResponseBreachNotifiedAt: null,
    resolutionAtRiskNotifiedAt: null, resolutionBreachNotifiedAt: null,
    ticket: { id: "mailbox-1", intake: null, assigneeId: "agent-1", status: "To Do", subDepartmentId: "sub-1", subDepartment: { departmentId: "dept-1" }, closedAt: null },
    ...overrides,
  })
  beforeEach(() => {
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([])
    vi.mocked(prisma.slaBreach.findMany).mockResolvedValue([])
    vi.mocked(prisma.departmentManager.findMany).mockResolvedValue([])
    vi.mocked(prisma.tenantMembership.findMany).mockResolvedValue([])
  })

  it("keeps resolution pending while first response counts from email receipt", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ mailboxConfig: { ...snapshot, resolutionActivatedAt: null } }) as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T09:20:00Z"), { includeDetails: true })
    expect(view?.firstResponse).toMatchObject({ elapsedMs: 1200000, running: true })
    expect(view?.resolution).toMatchObject({ elapsedMs: 0, remainingMs: 7200000, running: false, status: "ON_TRACK" })
    expect(view?.details?.resolutionStartedAt).toBeNull()
    await checkAndNotifySla("mailbox-1", new Date("2026-10-09T12:00:00Z"))
    expect(mockBreachCreate.mock.calls.some(([args]) => args.data.metric === "resolution")).toBe(false)
  })
  it("starts resolution at the configured active status, excluding initial queue time", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ mailboxConfig: { ...snapshot, resolutionActivatedAt: null } }) as never)
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([{ metadata: { to: "Investigating" }, createdAt: new Date("2026-10-09T09:20:00Z") }] as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T09:30:00Z"), { includeDetails: true })
    expect(view?.resolution).toMatchObject({ elapsedMs: 600000, running: true })
    expect(view?.details?.resolutionStartedAt).toBe("2026-10-09T09:20:00.000Z")
    expect(view?.firstResponse).toMatchObject({ elapsedMs: 1200000, running: false })
  })
  it("starts resolution at manual work tracking without changing the first-response clock", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ mailboxConfig: { ...snapshot, resolutionActivatedAt: null } }) as never)
    vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ startedAt: new Date("2026-10-09T09:15:00Z") } as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T09:30:00Z"))
    expect(view?.resolution).toMatchObject({ elapsedMs: 900000, running: true })
    expect(view?.firstResponse).toMatchObject({ elapsedMs: 1800000, running: true })
  })
  it("does not start resolution merely because the agent sends a first reply", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: new Date("2026-10-09T09:10:00Z"), mailboxConfig: { ...snapshot, resolutionActivatedAt: null } }) as never)
    mockTicketMessages.mockResolvedValue([{ direction: "outbound", status: "trusted", createdAt: new Date("2026-10-09T09:10:00Z") }] as never)
    expect((await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T09:30:00Z")))?.resolution).toMatchObject({ elapsedMs: 0, running: false })
  })
  it("heals older mailbox snapshots by finding the original agent-work start", async () => {
    const legacy = { ...snapshot, resolutionActivatedAt: undefined }
    mockTimerFind.mockResolvedValue(mailboxTimer({ mailboxConfig: legacy }) as never)
    vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ startedAt: new Date("2026-10-09T09:25:00Z") } as never)
    expect((await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T09:30:00Z")))?.resolution.elapsedMs).toBe(300000)
    expect(mockTimerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolutionStartedAt: new Date("2026-10-09T09:25:00Z") }) }))
  })
  it("persists activation once and keeps its original start across later work sessions", async () => {
    const timer = mailboxTimer({ mailboxConfig: { ...snapshot, resolutionActivatedAt: null } })
    mockTimerFind.mockResolvedValue(timer as never)
    const began = new Date("2026-10-09T09:15:00Z")
    vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ startedAt: began } as never)
    await startMailboxResolutionOnWork("mailbox-1", began)
    expect(mockTimerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolutionStartedAt: began, mailboxConfig: expect.objectContaining({ resolutionActivatedAt: began.toISOString() }) }) }))
    mockTimerUpdateMany.mockClear()
    await startMailboxResolutionOnWork("mailbox-1", new Date("2026-10-09T10:00:00Z"))
    expect(mockTimerUpdateMany).not.toHaveBeenCalled()
    expect(timer.resolutionStartedAt).toEqual(began)
  })
  it("closes a ticket with zero resolution time when agent work never began", async () => {
    const end = new Date("2026-10-09T11:05:00Z")
    const timer = mailboxTimer({ firstResponseStoppedAt: start, mailboxConfig: { ...snapshot, resolutionActivatedAt: null }, ticket: { ...mailboxTimer().ticket, closedAt: end } })
    mockTimerFind.mockResolvedValue(timer as never)
    mockTimerUpdate.mockImplementation((async ({ data }: { data: object }) => { Object.assign(timer, data); return timer }) as never)
    await syncResolutionTimerOnClosedAtChange("mailbox-1", end)
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({ where: { id: "mailbox-1", closedAt: end }, data: { resolutionDurationMins: 0, resolvedWithinAllowed: true } })
    expect(mockBreachCreate.mock.calls.some(([args]) => args.data.metric === "resolution")).toBe(false)
  })
  it("prefers per-mailbox targets over department targets without evaluating issues", async () => {
    mockDeptFind.mockResolvedValue({ mailboxFirstResponseMins: 60, mailboxResolutionMins: 480 } as never)
    vi.mocked(prisma.mailboxConnection.findFirst).mockResolvedValueOnce({ slaFirstResponseMins: 15, slaResolutionMins: 90 } as never)
    const plan = await prepareMailboxSla("tenant-1", "dept-1", { mailboxConnectionId: "mailbox-1", now: start })
    expect(plan).toMatchObject({ firstResponseTargetMins: 15, resolutionTargetMins: 90, mailboxConfig: { targetSource: "mailbox", resolutionActivatedAt: null } })
    expect(mockPolicyFindMany).not.toHaveBeenCalled()
  })
  it("does not apply tenant policies when department/mailbox targets are absent", async () => {
    mockDeptFind.mockResolvedValue({ mailboxFirstResponseMins: null, mailboxResolutionMins: null } as never)
    mockPolicyFindMany.mockResolvedValue([{ id: "tenant-default", conditions: { combinator: "AND", conditions: [] }, firstResponseMins: 45, resolutionMins: 360 }] as never)
    expect(await prepareMailboxSla("tenant-1", "dept-1", { now: start })).toBeNull()
    expect(mockPolicyFindMany).not.toHaveBeenCalled()
  })
  it("counts only working time from an after-hours Friday creation to Monday", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStartedAt: new Date("2026-10-09T17:30:00Z"), resolutionStartedAt: new Date("2026-10-09T17:30:00Z") }) as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-12T09:10:00Z"))
    expect(view).toMatchObject({ firstResponse: { elapsedMs: 600000, running: true }, resolution: { elapsedMs: 600000, running: true }, source: "mailbox" })
    expect(mockDeptFind).not.toHaveBeenCalled()
    expect(mockScheduleFind).not.toHaveBeenCalled()
  })
  it("pauses at the working-period end and begins again at the next opening", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStartedAt: new Date("2026-10-09T16:55:00Z"), resolutionStartedAt: new Date("2026-10-09T16:55:00Z") }) as never)
    const paused = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T17:10:00Z"))
    expect(paused?.resolution).toMatchObject({ elapsedMs: 300000, running: false })
    const resumed = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-12T09:05:00Z"))
    expect(resumed?.resolution).toMatchObject({ elapsedMs: 600000, running: true })
  })
  it("keeps the calendar stable when the current assignee/settings change", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ ticket: { ...mailboxTimer().ticket, assigneeId: "new-agent" } }) as never)
    expect((await getSlaIndicatorForTicket("mailbox-1", new Date("2026-10-09T10:00:00Z")))?.resolution.elapsedMs).toBe(3600000)
    expect(mockDeptFind).not.toHaveBeenCalled()
    expect(mockScheduleFind).not.toHaveBeenCalled()
  })
  it("pauses for trusted outbound replies, ignores generic status changes, and resumes on trusted customer replies", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: new Date("2026-10-09T09:10:00Z") }) as never)
    mockTicketMessages.mockResolvedValue([
      { direction: "outbound", status: "trusted", createdAt: new Date("2026-10-09T09:10:00Z") },
      { direction: "inbound", status: "quarantined", createdAt: new Date("2026-10-09T09:20:00Z") },
      { direction: "inbound", status: "trusted", createdAt: new Date("2026-10-09T09:40:00Z") },
    ] as never)
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([{ metadata: { from: "To Do", to: "In Progress" }, createdAt: new Date("2026-10-09T09:11:00Z") }] as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T10:00:00Z"))
    expect(view?.resolution).toMatchObject({ elapsedMs: 1800000, running: true })
  })
  it("pauses on explicit Waiting for Customer status even without an outbound message", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: start }) as never)
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([{ metadata: { from: "In Progress", to: "Waiting for Customer" }, createdAt: new Date("2026-10-09T09:10:00Z") }] as never)
    expect((await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T10:00:00Z")))?.resolution).toMatchObject({ elapsedMs: 600000, running: false })
  })
  it("records the first configured active transition before considering unanswered escalation", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer() as never)
    vi.mocked(prisma.activityLog.findMany).mockResolvedValue([{ metadata: { from: "To Do", to: "Investigating" }, createdAt: new Date("2026-10-09T09:20:00Z") }] as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T10:10:00Z"))
    expect(view?.firstResponse).toMatchObject({ elapsedMs: 1200000, running: false, status: "ON_TRACK" })
    expect(mockTimerUpdateMany).toHaveBeenCalledWith({ where: { ticketId: "mailbox-1", firstResponseStoppedAt: null }, data: { firstResponseStoppedAt: new Date("2026-10-09T09:20:00Z") } })
  })
  it("stops first response directly for a configured custom active status", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer() as never)
    await stopMailboxFirstResponseOnActiveStatus("mailbox-1", "Investigating", new Date("2026-10-09T09:20:00Z"))
    expect(mockTimerUpdateMany).toHaveBeenCalledWith({ where: { ticketId: "mailbox-1", firstResponseStoppedAt: null }, data: { firstResponseStoppedAt: new Date("2026-10-09T09:20:00Z") } })
  })
  it("supports configured warning percentages and tenant-manager recipients", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer() as never)
    vi.mocked(prisma.tenantMembership.findMany).mockResolvedValueOnce([{ userId: "tenant-manager" }] as never)
    await checkAndNotifySla("mailbox-1", new Date("2026-10-09T09:30:00Z"))
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "tenant-manager", type: "sla_at_risk", message: expect.stringContaining("First Response") }))
  })
  it("claims each breach once under concurrent sweeps, escalates once, and leaves overtime running", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer() as never)
    const fields = new Set<string>()
    mockTimerUpdateMany.mockImplementation((async ({ data }: { data: object }) => {
      const field = Object.keys(data)[0]
      if (fields.has(field)) return { count: 0 }
      fields.add(field); return { count: 1 }
    }) as never)
    const at = new Date("2026-10-09T10:01:00Z")
    await Promise.all([checkAndNotifySla("mailbox-1", at), checkAndNotifySla("mailbox-1", at)])
    expect(mockBreachCreate.mock.calls.filter(([args]) => args.data.metric === "first_response")).toHaveLength(1)
    const { escalateTicket } = await import("@/lib/ticket-escalation")
    expect(escalateTicket).toHaveBeenCalledTimes(1)
    expect((await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-09T10:02:00Z")))?.firstResponse).toMatchObject({ remainingMs: -120000, running: true })
  })
  it("does not breach resolution at exactly the target but does one second later", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: start }) as never)
    expect((await getSlaIndicatorForTicket("mailbox-1", new Date("2026-10-09T11:00:00Z")))?.resolution.status).toBe("AT_RISK")
    expect((await getSlaIndicatorForTicket("mailbox-1", new Date("2026-10-09T11:00:01Z")))?.resolution.status).toBe("BREACHED")
  })
  it("records a late first response breach without escalating a ticket already answered", async () => {
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: new Date("2026-10-09T10:01:00Z") }) as never)
    await checkAndNotifySla("mailbox-1", new Date("2026-10-09T10:01:00Z"))
    expect(mockBreachCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metric: "first_response" }) }))
    const { escalateTicket } = await import("@/lib/ticket-escalation")
    expect(escalateTicket).not.toHaveBeenCalled()
  })
  it("persists final mailbox working-time totals when closing", async () => {
    const end = new Date("2026-10-09T11:05:00Z")
    const timer = mailboxTimer({ firstResponseStoppedAt: start, ticket: { ...mailboxTimer().ticket, closedAt: end } })
    mockTimerFind.mockResolvedValue(timer as never)
    mockTimerUpdate.mockImplementation((async ({ data }: { data: object }) => {
      Object.assign(timer, data)
      return timer
    }) as never)
    await syncResolutionTimerOnClosedAtChange("mailbox-1", end)
    expect(mockTimerUpdate).toHaveBeenCalledWith({ where: { ticketId: "mailbox-1" }, data: { resolutionStoppedAt: end } })
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: "mailbox-1", closedAt: end },
      data: { resolutionDurationMins: 125, resolvedWithinAllowed: false },
    })
    const { escalateTicket } = await import("@/lib/ticket-escalation")
    expect(escalateTicket).not.toHaveBeenCalled()
  })
  it("freezes final totals and does not alert again after completion", async () => {
    const end = new Date("2026-10-09T11:05:00Z")
    mockTimerFind.mockResolvedValue(mailboxTimer({ firstResponseStoppedAt: start, resolutionStoppedAt: end, ticket: { ...mailboxTimer().ticket, closedAt: end } }) as never)
    const view = await getSlaIndicatorViewForTicket("mailbox-1", new Date("2026-10-12T12:00:00Z"))
    expect(view?.resolution).toMatchObject({ elapsedMs: 7500000, running: false, remainingMs: -300000 })
    await checkAndNotifySla("mailbox-1", new Date("2026-10-12T12:00:00Z"))
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
