import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    subDepartmentStatus: { findMany: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}))

import { resolveReopenStatus, maybeReopenTicket } from "./customer-reopen"
import { prisma } from "@/lib/db"

const mockFindTicket = vi.mocked(prisma.ticket.findUnique)
const mockUpdateTicket = vi.mocked(prisma.ticket.update)
const mockFindStatuses = vi.mocked(prisma.subDepartmentStatus.findMany)
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

  it("handles a typical subDepartment workflow correctly", () => {
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
const SUB_DEPARTMENT_ID = "team-1"
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
  it("labels a closed ticket but leaves status/closedAt and timers untouched", async () => {
    mockFindTicket.mockResolvedValue({ status: "Done", labels: [] } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)
    expect(await maybeReopenTicket(TICKET_ID, SUB_DEPARTMENT_ID, ACTOR_ID)).toBe(false)
    expect(mockUpdateTicket).toHaveBeenCalledWith({ where: { id: TICKET_ID }, data: { labels: ["Reopened"] } })
    expect(mockCreateLog).not.toHaveBeenCalled()
  })
  it("does not change an open ticket", async () => {
    mockFindTicket.mockResolvedValue({ status: "In Progress", labels: [] } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)
    expect(await maybeReopenTicket(TICKET_ID, SUB_DEPARTMENT_ID, ACTOR_ID)).toBe(false)
    expect(mockUpdateTicket).not.toHaveBeenCalled()
  })
  it("does not repeatedly write the attention label", async () => {
    mockFindTicket.mockResolvedValue({ status: "Done", labels: ["Reopened"] } as never)
    mockFindStatuses.mockResolvedValue(typicalStatuses as never)
    await maybeReopenTicket(TICKET_ID, SUB_DEPARTMENT_ID, ACTOR_ID)
    expect(mockUpdateTicket).not.toHaveBeenCalled()
  })
})
