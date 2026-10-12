import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/db", () => ({ prisma: { activityLog: { findFirst: vi.fn() } } }))
import { prisma } from "@/lib/db"
import { getWorkCycleStart } from "./work-cycle"
describe("work cycle boundary", () => {
  it("selects the latest reopen reset independently of activity-feed limits", async () => {
    const createdAt = new Date("2026-10-12T10:00:00Z")
    vi.mocked(prisma.activityLog.findFirst).mockResolvedValue({ createdAt } as never)
    expect(await getWorkCycleStart("ticket-1")).toEqual(createdAt)
    expect(prisma.activityLog.findFirst).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1", action: "TIMER_RESET", metadata: { path: ["reopenCycle"], equals: true } },
      orderBy: { createdAt: "desc" }, select: { createdAt: true },
    })
  })
  it("keeps all work when there was no reopened cycle", async () => {
    vi.mocked(prisma.activityLog.findFirst).mockResolvedValue(null)
    expect(await getWorkCycleStart("ticket-1")).toBeNull()
  })
})
