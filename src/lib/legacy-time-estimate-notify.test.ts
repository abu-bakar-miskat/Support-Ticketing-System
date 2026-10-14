import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/db", () => ({ prisma: {
  ticket: { findUnique: vi.fn(), updateMany: vi.fn() },
  timeEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { durationSecs: 0 } }) },
} }))
vi.mock("@/lib/work-cycle", () => ({ getWorkCycleStart: vi.fn() }))
vi.mock("@/lib/notify", () => ({ createNotification: vi.fn() }))
import { prisma } from "@/lib/db"
import { getWorkCycleStart } from "./work-cycle"
import { checkAndNotifyLegacyEstimateOverrun } from "./legacy-time-estimate-notify"
describe("legacy estimates after reopen", () => {
  it.each([null, new Date("2026-10-12T10:00:00Z")])("uses the saved cycle boundary %s", async (cycleStart) => {
    vi.mocked(prisma.ticket.findUnique).mockResolvedValue({ estimatedTime: 5, estimateOverrunNotifiedAt: null, deletedAt: null } as never)
    vi.mocked(getWorkCycleStart).mockResolvedValue(cycleStart)
    await checkAndNotifyLegacyEstimateOverrun("ticket-1")
    expect(prisma.timeEntry.aggregate).toHaveBeenLastCalledWith({
      where: { ticketId: "ticket-1", endedAt: { not: null }, ...(cycleStart ? { startedAt: { gte: cycleStart } } : {}) },
      _sum: { durationSecs: true },
    })
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
  })
})
