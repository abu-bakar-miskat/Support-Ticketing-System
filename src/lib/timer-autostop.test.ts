vi.mock("@/lib/status-category.server", () => ({ getTicketStatusCategory: vi.fn(async (_id, label) => label === "In Progress" ? "IN_PROGRESS" : "BLOCKED") }))
vi.mock("@/lib/sla-engine", () => ({ checkAndNotifySla: vi.fn().mockResolvedValue(undefined), stopMailboxFirstResponseOnActiveStatus: vi.fn().mockResolvedValue(undefined) }))
import { beforeEach, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ prisma: {
  timeEntry: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(async (operations) => Promise.all(operations)),
} }))
vi.mock("@/lib/manual-resolution", () => ({ finalizeManualResolution: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/time-estimate-notify", () => ({ checkAndNotifyEstimateOverrun: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/timer-broadcast", () => ({ broadcastTimerChange: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/ticket-events", () => ({ broadcastTicketEvent: vi.fn().mockResolvedValue(undefined) }))
import { prisma } from "@/lib/db"
import { finalizeManualResolution } from "@/lib/manual-resolution"
import { checkAndNotifyEstimateOverrun } from "@/lib/time-estimate-notify"
import { stopRunningTimersOnStatusChange } from "./timer-autostop"
beforeEach(() => vi.clearAllMocks())
it("does not stop work while In Progress", async () => {
  await stopRunningTimersOnStatusChange("manual-1", "In Progress")
  expect(finalizeManualResolution).not.toHaveBeenCalled()
  expect(prisma.timeEntry.findMany).not.toHaveBeenCalled()
})
it("finalizes completed manual work before normal status stopping", async () => {
  await stopRunningTimersOnStatusChange("manual-1", "Done")
  expect(finalizeManualResolution).toHaveBeenCalledWith("manual-1")
  expect(checkAndNotifyEstimateOverrun).toHaveBeenCalledWith("manual-1")
})
it("checks an estimate after persisting an automatically stopped session", async () => {
  vi.mocked(prisma.timeEntry.findMany).mockResolvedValueOnce([{
    id: "lap-1", profileId: "agent-1", startedAt: new Date(Date.now() - 61000), profile: { name: "Agent" },
  }] as never)
  await stopRunningTimersOnStatusChange("manual-1", "Paused")
  expect(prisma.timeEntry.update).toHaveBeenCalled()
  expect(checkAndNotifyEstimateOverrun).toHaveBeenCalledWith("manual-1")
  expect(vi.mocked(prisma.$transaction).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(checkAndNotifyEstimateOverrun).mock.invocationCallOrder[0],
  )
})

it("keeps work running between custom In progress statuses", async () => {
  await stopRunningTimersOnStatusChange("manual-1", "Quality check", "IN_PROGRESS")
  expect(prisma.timeEntry.findMany).not.toHaveBeenCalled()
})
it("stops work in the Blocked category even when the label is In Progress", async () => {
  await stopRunningTimersOnStatusChange("manual-1", "In Progress", "BLOCKED")
  expect(prisma.timeEntry.findMany).toHaveBeenCalled()
})
