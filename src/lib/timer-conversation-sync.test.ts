import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    ticketMessage: { findFirst: vi.fn() },
  },
}))
vi.mock("@/lib/timer-autostart", () => ({
  startTimerOnStatusChange: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/timer-autostop", () => ({
  stopRunningTimersForWaitingCustomer: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db"
import { startTimerOnStatusChange } from "@/lib/timer-autostart"
import { stopRunningTimersForWaitingCustomer } from "@/lib/timer-autostop"
import {
  syncWorkTimerWithConversation,
  syncWorkTimerWithLatestConversation,
} from "./timer-conversation-sync"

const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockStart = vi.mocked(startTimerOnStatusChange)
const mockStop = vi.mocked(stopRunningTimersForWaitingCustomer)
const mockFindLatestMessage = vi.mocked(prisma.ticketMessage.findFirst)

beforeEach(() => vi.clearAllMocks())

describe("syncWorkTimerWithConversation", () => {
  it("pauses ticket timers when the conversation waits for the customer", async () => {
    await syncWorkTimerWithConversation("ticket-1", "outbound")

    expect(mockStop).toHaveBeenCalledWith("ticket-1")
    expect(mockStart).not.toHaveBeenCalled()
  })

  it("resumes the primary assignee when the conversation waits for an assignee", async () => {
    const assignee = { id: "agent-1", name: "Agent One", avatarUrl: null }
    mockFindTicket.mockResolvedValue({ status: "IN PROGRESS", assignee } as never)

    await syncWorkTimerWithConversation("ticket-1", "inbound")

    expect(mockStart).toHaveBeenCalledWith("ticket-1", "IN PROGRESS", assignee)
    expect(mockStop).not.toHaveBeenCalled()
  })

  it("does not start a timer for an unassigned ticket", async () => {
    mockFindTicket.mockResolvedValue({ status: "IN PROGRESS", assignee: null } as never)

    await syncWorkTimerWithConversation("ticket-1", "inbound")

    expect(mockStart).not.toHaveBeenCalled()
  })

  it("reconciles timer state from the latest persisted message", async () => {
    mockFindLatestMessage.mockResolvedValue({ direction: "outbound" } as never)

    await syncWorkTimerWithLatestConversation("ticket-1")

    expect(mockStop).toHaveBeenCalledWith("ticket-1")
  })
})
