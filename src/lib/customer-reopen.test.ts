import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    teamStatus: { findMany: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))

import { resolveReopenStatus, maybeReopenTicket } from "./customer-reopen"
import { prisma } from "@/lib/db"

const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockUpdateTicket = vi.mocked(prisma.ticket.update)
const mockFindStatuses = vi.mocked(prisma.teamStatus.findMany)
const mockCreateLog = vi.mocked(prisma.activityLog.create)

// ── resolveReopenStatus ───────────────────────────────────────────────────────

describe("resolveReopenStatus", () => {
  it("returns the first non-completion status (by order)", () => {
    const statuses = [
      { label: "In Progress", isComplete: false, order: 1 },
      { label: "Done", isComplete: true, order: 2 },
    ]
    expect(resolveReopenStatus(statuses)).toBe("In Progress")
  })

  it("skips leading completion statuses and picks the first non-completion one", () => {
    const statuses = [
      { label: "Closed", isComplete: true, order: 0 },
      { label: "Resolved", isComplete: true, order: 1 },
      { label: "Reopened", isComplete: false, order: 2 },
      { label: "In Progress", isComplete: false, order: 3 },
    ]
    expect(resolveReopenStatus(statuses)).toBe("Reopened")
  })

  it("returns null when all statuses are completion statuses (edge case)", () => {
    const statuses = [
      { label: "Resolved", isComplete: true, order: 0 },
      { label: "Closed", isComplete: true, order: 1 },
    ]
    expect(resolveReopenStatus(statuses)).toBeNull()
  })

  it("returns the only status if it is non-completion", () => {
    const statuses = [{ label: "Open", isComplete: false, order: 0 }]
    expect(resolveReopenStatus(statuses)).toBe("Open")
  })

  it("returns null for an empty status list", () => {
    expect(resolveReopenStatus([])).toBeNull()
  })

  it("handles a typical team workflow correctly", () => {
    const statuses = [
      { label: "Not Started", isComplete: false, order: 0 },
      { label: "In Progress", isComplete: false, order: 1 },
      { label: "In Review", isComplete: false, order: 2 },
      { label: "Done", isComplete: true, order: 3 },
    ]
    expect(resolveReopenStatus(statuses)).toBe("Not Started")
  })
})

// ── maybeReopenTicket ─────────────────────────────────────────────────────────

const TICKET_ID = "ticket-1"
const TEAM_ID = "team-1"
const ACTOR_ID = "creator-profile-id"

const typicalStatuses = [
  { label: "Not Started", isComplete: false, order: 0 },
  { label: "In Progress", isComplete: false, order: 1 },
  { label: "Done", isComplete: true, order: 2 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateTicket.mockResolvedValue({} as never)
  mockCreateLog.mockResolvedValue({} as never)
})

describe("maybeReopenTicket", () => {
  it("reopens a ticket that is in a completion status", async () => {
    mockFindTicket.mockResolvedValue({ status: "Done" } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)

    const result = await maybeReopenTicket(TICKET_ID, TEAM_ID, ACTOR_ID)

    expect(result).toBe(true)
    expect(mockUpdateTicket).toHaveBeenCalledWith({
      where: { id: TICKET_ID },
      data: { status: "Not Started", closedAt: null },
    })
    expect(mockCreateLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: TICKET_ID,
        actorId: ACTOR_ID,
        action: "STATUS_CHANGED",
        metadata: expect.objectContaining({
          from: "Done",
          to: "Not Started",
          triggeredBy: "customer_reply",
        }),
      }),
    })
  })

  it("does not reopen a ticket that is not in a completion status", async () => {
    mockFindTicket.mockResolvedValue({ status: "In Progress" } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)

    const result = await maybeReopenTicket(TICKET_ID, TEAM_ID, ACTOR_ID)

    expect(result).toBe(false)
    expect(mockUpdateTicket).not.toHaveBeenCalled()
    expect(mockCreateLog).not.toHaveBeenCalled()
  })

  it("stays put (returns false) when all team statuses are completion statuses", async () => {
    mockFindTicket.mockResolvedValue({ status: "Closed" } as never)
    mockFindStatuses.mockResolvedValue([
      { label: "Resolved", isComplete: true, order: 0 },
      { label: "Closed", isComplete: true, order: 1 },
    ] as never)

    const result = await maybeReopenTicket(TICKET_ID, TEAM_ID, ACTOR_ID)

    expect(result).toBe(false)
    expect(mockUpdateTicket).not.toHaveBeenCalled()
  })

  it("returns false when the ticket is not found", async () => {
    mockFindTicket.mockResolvedValue(null as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)

    const result = await maybeReopenTicket(TICKET_ID, TEAM_ID, ACTOR_ID)

    expect(result).toBe(false)
    expect(mockUpdateTicket).not.toHaveBeenCalled()
  })

  it("clears closedAt when reopening", async () => {
    mockFindTicket.mockResolvedValue({ status: "Done" } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)

    await maybeReopenTicket(TICKET_ID, TEAM_ID, ACTOR_ID)

    expect(mockUpdateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ closedAt: null }) }),
    )
  })
})
