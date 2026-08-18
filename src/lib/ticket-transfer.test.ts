import { describe, it, expect, vi, beforeEach } from "vitest"

const mockTx = {
  subDepartmentTicketCounter: { upsert: vi.fn() },
  ticket: { update: vi.fn() },
  activityLog: { create: vi.fn() },
  ticketAccessGrant: { upsert: vi.fn() },
}

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn() },
    subDepartment: { findUnique: vi.fn() },
    subDepartmentMembership: { findUnique: vi.fn() },
    boardColumn: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  },
}))

import { prisma } from "@/lib/db"
import { transferTicket } from "./ticket-transfer"

const mockTicketFind = vi.mocked(prisma.ticket.findUnique)
const mockTeamFind = vi.mocked(prisma.subDepartment.findUnique)
const mockMembershipFind = vi.mocked(prisma.subDepartmentMembership.findUnique)
const mockBoardColumns = vi.mocked(prisma.boardColumn.findMany)

const baseTicket = {
  id: "ticket-1",
  subDepartmentId: "team-source",
  assigneeId: "agent-1",
  deletedAt: null,
  subDepartment: { id: "team-source", name: "Billing", departmentId: "dept-A", tenantId: "tenant-1" },
}

const baseTargetTeam = {
  id: "team-target",
  name: "Onboarding",
  departmentId: "dept-B",
  tenantId: "tenant-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTicketFind.mockResolvedValue(baseTicket as never)
  mockTeamFind.mockResolvedValue(baseTargetTeam as never)
  mockMembershipFind.mockResolvedValue(null as never)
  mockBoardColumns.mockResolvedValue([
    { id: "col-todo", statusType: "OPEN", order: 0 },
    { id: "col-progress", statusType: "OPEN", order: 1 },
    { id: "col-done", statusType: "RESOLVED", order: 2 },
  ] as never)
  mockTx.subDepartmentTicketCounter.upsert.mockResolvedValue({ subDepartmentId: "team-target", lastNumber: 7 } as never)
})

describe("transferTicket", () => {
  it("moves the ticket, renumbers, remaps to the destination's first OPEN column, and clears a non-member assignee", async () => {
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(result).toEqual({
      ok: true,
      ticketId: "ticket-1",
      fromTeamId: "team-source",
      toTeamId: "team-target",
      newTicketNumber: 7,
    })
    expect(mockTx.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: {
        subDepartmentId: "team-target",
        ticketNumber: 7,
        assigneeId: null,
        boardColumnId: "col-todo",
      },
    })
  })

  it("keeps the assignee when they're an active member of the destination team", async () => {
    mockMembershipFind.mockResolvedValue({ isActive: true } as never)

    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: "agent-1" }) }),
    )
  })

  it("records a FORWARDED activity log entry with from/to team + department metadata", async () => {
    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.activityLog.create).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        actorId: "actor-1",
        action: "FORWARDED",
        metadata: {
          fromTeamId: "team-source",
          fromTeamName: "Billing",
          fromDepartmentId: "dept-A",
          toTeamId: "team-target",
          toTeamName: "Onboarding",
          toDepartmentId: "dept-B",
        },
      },
    })
  })

  it("grants the transferring actor retained read access (ASG-06)", async () => {
    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.ticketAccessGrant.upsert).toHaveBeenCalledWith({
      where: { ticketId_userId: { ticketId: "ticket-1", userId: "actor-1" } },
      create: { ticketId: "ticket-1", userId: "actor-1", reason: "transfer" },
      update: {},
    })
  })

  it("rejects when the ticket doesn't exist or is deleted", async () => {
    mockTicketFind.mockResolvedValue(null as never)
    const result = await transferTicket({ ticketId: "missing", targetTeamId: "team-target", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Ticket not found" })
  })

  it("rejects an unknown destination team", async () => {
    mockTeamFind.mockResolvedValue(null as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "nope", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Destination team not found" })
  })

  it("rejects a destination team in a different tenant", async () => {
    mockTeamFind.mockResolvedValue({ ...baseTargetTeam, tenantId: "tenant-2" } as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Destination team is outside this tenant" })
  })

  it("rejects transferring a ticket to the team it's already in", async () => {
    mockTeamFind.mockResolvedValue({ ...baseTargetTeam, id: "team-source" } as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-source", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Ticket is already in that team" })
  })

  it("leaves boardColumnId unset when the destination board has no OPEN column", async () => {
    mockBoardColumns.mockResolvedValue([{ id: "col-done", statusType: "RESOLVED", order: 0 }] as never)

    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ boardColumnId: expect.anything() }) }),
    )
  })
})
