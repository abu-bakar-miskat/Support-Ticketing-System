import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    department: { findUnique: vi.fn() },
    slaPolicy: { findMany: vi.fn() },
    slaTimer: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    slaBreach: { create: vi.fn() },
    memberSchedule: { findUnique: vi.fn() },
    memberHoliday: { findMany: vi.fn() },
    departmentHoliday: { findMany: vi.fn() },
    departmentManager: { findMany: vi.fn() },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
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
} from "./sla-engine"

const mockDeptFind = vi.mocked(prisma.department.findUnique)
const mockPolicyFindMany = vi.mocked(prisma.slaPolicy.findMany)
const mockTimerCreate = vi.mocked(prisma.slaTimer.create)
const mockTimerFind = vi.mocked(prisma.slaTimer.findUnique)
const mockTimerUpdate = vi.mocked(prisma.slaTimer.update)
const mockTimerUpdateMany = vi.mocked(prisma.slaTimer.updateMany)
const mockBreachCreate = vi.mocked(prisma.slaBreach.create)
const mockScheduleFind = vi.mocked(prisma.memberSchedule.findUnique)
const mockMemberHolidays = vi.mocked(prisma.memberHoliday.findMany)
const mockDeptHolidays = vi.mocked(prisma.departmentHoliday.findMany)
const mockDeptManagers = vi.mocked(prisma.departmentManager.findMany)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockCreateNotification = vi.mocked(createNotification)

beforeEach(() => {
  vi.clearAllMocks()
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
