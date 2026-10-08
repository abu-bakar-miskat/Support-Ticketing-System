import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    slaPolicy: { findMany: vi.fn(), findFirst: vi.fn() },
    slaTimer: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    slaBreach: { create: vi.fn() },
    ticketMessage: { findMany: vi.fn() },
    memberSchedule: { findUnique: vi.fn() },
    memberHoliday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    departmentManager: { findMany: vi.fn() },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
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
  startSlaTimers,
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
  mockTicketMessages.mockResolvedValue([] as never)
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

    expect(mockTimerUpdate).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1" },
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
