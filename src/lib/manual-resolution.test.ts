import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => {
  const db = {
    ticket: { findFirst: vi.fn(), updateMany: vi.fn() },
    timeEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    slaBreach: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    tenantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    departmentManager: { findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  db.$transaction.mockImplementation(async (fn) => fn(db))
  return { prisma: db }
})
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/timer-broadcast", () => ({ broadcastTimerChange: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-events", () => ({ broadcastTicketEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/legacy-time-estimate-notify", () => ({ checkAndNotifyLegacyEstimateOverrun: vi.fn() }))

import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { broadcastTicketEvent } from "@/lib/ticket-events"
import { checkAndNotifyLegacyEstimateOverrun } from "@/lib/legacy-time-estimate-notify"
import { checkAndNotifyEstimateOverrun } from "./time-estimate-notify"
import { getManualResolutionView, finalizeManualResolution, trackedWorkSeconds, manualTicketWhere } from "./manual-resolution"

const now = new Date("2026-10-09T12:00:00Z")
const ticket = {
  id: "manual-1", tenantId: "tenant-1", estimatedTime: 1,
  closedAt: null, estimateOverrunNotifiedAt: null, assigneeId: "agent-1",
  subDepartment: { departmentId: "dept-1" },
}
const stopped = (seconds: number) => ({
  startedAt: new Date(now.getTime() - seconds * 1000), endedAt: now, durationSecs: seconds,
})
const running = (seconds: number) => ({ ...stopped(seconds), endedAt: null, durationSecs: null })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticket as never)
  vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 1 })
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([])
  vi.mocked(prisma.departmentManager.findMany).mockResolvedValue([
    { userId: "manager-1" }, { userId: "agent-1" },
  ] as never)
})

describe("manual estimated-time resolution", () => {
  it.each([0, 59, 60])("does not breach at %i seconds for a one-minute estimate", async (seconds) => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([stopped(seconds)] as never)
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
    expect(prisma.slaBreach.create).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("sums multiple users' stopped and running sessions and alerts each recipient once", async () => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([stopped(30), running(31)] as never)
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(prisma.slaBreach.create).toHaveBeenCalledExactlyOnceWith({ data: {
      ticketId: ticket.id, tenantId: ticket.tenantId, timerId: `manual:${ticket.id}`,
      metric: "resolution", targetMins: 1, breachedAt: now,
    } })
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "manager-1" }))
    // Breaching never stops work.
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled()
  })

  it("does not record or alert when another checker already claimed the breach", async () => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([running(61)] as never)
    vi.mocked(prisma.ticket.updateMany).mockResolvedValue({ count: 0 })
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(prisma.slaBreach.create).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("keeps overtime increasing after a recorded breach without repeating alerts", async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ ...ticket, estimateOverrunNotifiedAt: now } as never)
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([running(120)] as never)
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(await trackedWorkSeconds(ticket.id, now)).toBe(120)
    expect(await trackedWorkSeconds(ticket.id, new Date(now.getTime() + 1000))).toBe(121)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("ignores elapsed wall time when no work was tracked", async () => {
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("excludes support, portal and mailbox origins and preserves their existing alert behavior", async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null)
    await checkAndNotifyEstimateOverrun("other", now)
    expect(prisma.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining(manualTicketWhere),
    }))
    expect(checkAndNotifyLegacyEstimateOverrun).toHaveBeenCalledWith("other")
    expect(prisma.slaBreach.create).not.toHaveBeenCalled()
  })

  it.each([null, 0])("skips missing/nonpositive estimate %s", async (estimatedTime) => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ ...ticket, estimatedTime } as never)
    await checkAndNotifyEstimateOverrun(ticket.id, now)
    expect(prisma.timeEntry.findMany).not.toHaveBeenCalled()
  })

  it("skips already-resolved tickets during routine checks", async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ ...ticket, closedAt: now } as never)
    await checkAndNotifyEstimateOverrun(ticket.id, new Date(now.getTime() + 3600000))
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("finalizes at completion and records a breach crossed before closing, without needing In Progress", async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ ...ticket, closedAt: now } as never)
    const work = { ...running(61), id: "lap-1", profileId: "agent-1", profile: { name: "Agent" } }
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([work] as never)
    vi.mocked(prisma.timeEntry.updateMany).mockResolvedValue({ count: 1 })
    await finalizeManualResolution(ticket.id)
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "lap-1", endedAt: null }, data: { endedAt: now, durationSecs: 61 },
    })
    expect(broadcastTicketEvent).toHaveBeenCalledWith(ticket.id, "TIMER_STOPPED", "agent-1", expect.objectContaining({ durationSecs: 61 }))
    expect(prisma.ticket.updateMany).toHaveBeenLastCalledWith({
      where: { id: ticket.id, closedAt: now },
      data: { resolutionDurationMins: 1, resolvedWithinAllowed: false },
    })
    expect(prisma.slaBreach.create).toHaveBeenCalledTimes(1)
  })

  it("caps a late stop at completion and excludes sessions started afterward", async () => {
    vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([
      { ...stopped(61), endedAt: new Date(now.getTime() + 3600000), durationSecs: 3661 },
      { ...running(30), startedAt: new Date(now.getTime() + 1000) },
    ] as never)
    expect(await trackedWorkSeconds(ticket.id, now)).toBe(61)
  })
})


it("notifies active tenant managers and deduplicates department managers", async () => {
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([stopped(61)] as never)
  vi.mocked(prisma.tenantMembership.findMany).mockResolvedValueOnce([
    { userId: "tenant-manager" }, { userId: "manager-1" },
  ] as never)
  await checkAndNotifyEstimateOverrun(ticket.id, now)
  expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith({
    where: { tenantId: ticket.tenantId, role: "manager", isActive: true }, select: { userId: true },
  })
  expect(createNotification).toHaveBeenCalledTimes(3)
  expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "tenant-manager" }))
})

it("shows a completed manual resolution overview without a first-response clock", async () => {
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ ...ticket, estimatedTime: 5, closedAt: now } as never)
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([stopped(496)] as never)
  vi.mocked(prisma.slaBreach.findMany).mockResolvedValueOnce([{ targetMins: 5, breachedAt: now }] as never)
  const view = await getManualResolutionView(ticket.id, new Date(now.getTime() + 60000), true)
  expect(view).toMatchObject({ trackedSecs: 496, overtimeSecs: 196, estimatedMins: 5, status: "BREACHED", runningCount: 0 })
  expect(view?.details?.breaches).toHaveLength(1)
  expect(view).not.toHaveProperty("firstResponse")
})

it("omits privileged manual overview details for agents", async () => {
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValue([running(60)] as never)
  const view = await getManualResolutionView(ticket.id, now, false)
  expect(view).toMatchObject({ trackedSecs: 60, status: "ON_TRACK", runningCount: 1 })
  expect(view).not.toHaveProperty("details")
  expect(prisma.slaBreach.findMany).not.toHaveBeenCalled()
})
