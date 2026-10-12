vi.mock("@/lib/work-cycle", () => ({ getWorkCycleStart: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/sla-engine", () => ({ syncResolutionTimerOnClosedAtChange: vi.fn().mockResolvedValue(undefined), startMailboxResolutionOnWork: vi.fn().mockResolvedValue(undefined) }))
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    timeEntry: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/timer-broadcast", () => ({ broadcastTimerChange: vi.fn() }))
vi.mock("@/lib/ticket-events", () => ({ broadcastTicketEvent: vi.fn() }))

import { getWorkCycleStart } from "@/lib/work-cycle"
import { prisma } from "@/lib/db"
import { startTimerOnStatusChange } from "./timer-autostart"

const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockFindRunning = vi.mocked(prisma.timeEntry.findFirst)

beforeEach(() => vi.clearAllMocks())

describe("startTimerOnStatusChange", () => {
  it("does not auto-start while the conversation is Waiting for customer", async () => {
    mockFindTicket.mockResolvedValue({
      assigneeId: "agent-1",
      assignees: [],
      messages: [{ direction: "outbound", createdAt: new Date() }],
    } as never)

    await startTimerOnStatusChange("ticket-1", "IN PROGRESS", {
      id: "agent-1",
      name: "Agent One",
    })

    expect(mockFindRunning).not.toHaveBeenCalled()
  })

  it("does not restart a reply timer that the assignee already paused", async () => {
    const repliedAt = new Date("2026-10-02T11:52:17Z")
    mockFindTicket.mockResolvedValue({
      assigneeId: "agent-1",
      assignees: [],
      messages: [{ direction: "inbound", createdAt: repliedAt }],
    } as never)
    mockFindRunning.mockResolvedValueOnce({ id: "handled-entry" } as never)

    await startTimerOnStatusChange("ticket-1", "IN PROGRESS", {
      id: "agent-1",
      name: "Agent One",
    })

    expect(mockFindRunning).toHaveBeenCalledWith({
      where: {
        ticketId: "ticket-1",
        profileId: "agent-1",
        OR: [
          { endedAt: null },
          { startedAt: { gte: repliedAt } },
        ],
      },
      select: { id: true },
    })
    expect(mockFindRunning).toHaveBeenCalledTimes(1)
  })
})


it("does not auto-start work on a completed ticket after a customer reply", async () => {
  mockFindTicket.mockResolvedValue({ closedAt: new Date(), deletedAt: null, assigneeId: "agent-1", assignees: [], messages: [] } as never)
  await startTimerOnStatusChange("ticket-1", "In Progress", { id: "agent-1", name: "Agent" })
  expect(mockFindRunning).not.toHaveBeenCalled()
})

it("ignores previous-cycle outbound waits and sessions when reopening", async () => {
  const cycleStart = new Date("2026-10-12T10:00:00Z")
  vi.mocked(getWorkCycleStart).mockResolvedValueOnce(cycleStart)
  mockFindTicket.mockResolvedValue({ closedAt: null, assigneeId: "agent-1", assignees: [], messages: [{ direction: "outbound", createdAt: new Date("2026-10-09T10:00:00Z") }] } as never)
  mockFindRunning.mockResolvedValueOnce({ id: "current-cycle-running" } as never)
  await startTimerOnStatusChange("ticket-1", "In Progress", { id: "agent-1", name: "Agent" })
  expect(mockFindRunning).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ endedAt: null }, { startedAt: { gte: cycleStart } }] }) }))
})
