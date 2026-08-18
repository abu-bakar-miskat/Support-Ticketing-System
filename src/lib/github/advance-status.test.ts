import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), updateMany: vi.fn() },
    subDepartmentStatus: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock("@/lib/ticket-completion-notify", () => ({
  notifyTicketCompletion: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/ticket-cascade", () => ({
  cascadeCompleteToSubtickets: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { advanceTicketStatus } from "./advance-status"

const mockFindUnique = vi.mocked(prisma.ticket.findUnique)
const mockUpdateMany = vi.mocked(prisma.ticket.updateMany)
const mockStatusFindMany = vi.mocked(prisma.subDepartmentStatus.findMany)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockNotify = vi.mocked(notifyTicketCompletion)
const mockCascade = vi.mocked(cascadeCompleteToSubtickets)

const baseTicket = {
  id: "ticket-1",
  title: "Fix login",
  status: "Not Started",
  subDepartmentId: "team-1",
  ticketNumber: 42,
  creatorId: "user-1",
  closedAt: null,
  deletedAt: null,
  subDepartment: { prefix: "DEV", githubStatusMap: null },
  intake: null,
}

const STATUSES = [
  { label: "Not Started", order: 0, isComplete: false },
  { label: "In Progress", order: 1, isComplete: false },
  { label: "Done", order: 2, isComplete: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue(baseTicket as never)
  mockStatusFindMany.mockResolvedValue(STATUSES as never)
  mockUpdateMany.mockResolvedValue({ count: 1 } as never)
  // The status update runs inside a transaction that first sets the actor +
  // activity-source GUCs; run the callback with a tx exposing the same mocks.
  mockTransaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn({
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      ticket: { updateMany: mockUpdateMany },
    })) as never)
})

describe("advanceTicketStatus", () => {
  it("moves the ticket forward with an optimistic status guard", async () => {
    await advanceTicketStatus("ticket-1", "prOpened")

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", status: "Not Started" },
      data: { status: "In Progress", closedAt: null },
    })
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockCascade).not.toHaveBeenCalled()
  })

  it("does nothing when the ticket does not exist", async () => {
    mockFindUnique.mockResolvedValue(null as never)
    await advanceTicketStatus("gone", "prMerged")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("does nothing when the ticket is soft-deleted", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, deletedAt: new Date() } as never)
    await advanceTicketStatus("ticket-1", "prMerged")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("does nothing when the guard rejects (backward move)", async () => {
    mockFindUnique.mockResolvedValue({ ...baseTicket, status: "Done" } as never)
    await advanceTicketStatus("ticket-1", "prOpened")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("never auto-completes an intake-linked ticket", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      intake: { id: "intake-1" },
    } as never)
    await advanceTicketStatus("ticket-1", "prMerged")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it("sets closedAt and fires completion side effects on completing moves", async () => {
    await advanceTicketStatus("ticket-1", "prMerged")

    const updateArg = mockUpdateMany.mock.calls[0][0]
    expect(updateArg.data.status).toBe("Done")
    expect(updateArg.data.closedAt).toBeInstanceOf(Date)
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        humanId: "DEV-42",
        actorName: "GitHub",
      }),
    )
    expect(mockCascade).toHaveBeenCalledWith("ticket-1")
  })

  it("preserves an existing closedAt", async () => {
    const earlier = new Date("2026-01-01T00:00:00Z")
    mockFindUnique.mockResolvedValue({ ...baseTicket, closedAt: earlier } as never)
    await advanceTicketStatus("ticket-1", "prMerged")
    expect(mockUpdateMany.mock.calls[0][0].data.closedAt).toBe(earlier)
  })

  it("skips completion side effects when the ticket changed concurrently", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)
    await advanceTicketStatus("ticket-1", "prMerged")
    expect(mockNotify).not.toHaveBeenCalled()
    expect(mockCascade).not.toHaveBeenCalled()
  })

  it("respects a team override from githubStatusMap", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      subDepartment: { prefix: "DEV", githubStatusMap: { onPrOpened: "Done", onPrReadyForReview: null, onPrMerged: null } },
    } as never)
    await advanceTicketStatus("ticket-1", "prOpened")
    expect(mockUpdateMany.mock.calls[0][0].data.status).toBe("Done")
  })

  it("does nothing when the event is disabled by override", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseTicket,
      subDepartment: { prefix: "DEV", githubStatusMap: { onPrOpened: "", onPrReadyForReview: null, onPrMerged: null } },
    } as never)
    await advanceTicketStatus("ticket-1", "prOpened")
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})
