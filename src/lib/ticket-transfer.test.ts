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
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  },
}))

import { prisma } from "@/lib/db"
import { transferTicket } from "./ticket-transfer"

const mockTicketFind = vi.mocked(prisma.ticket.findUnique)
const mockSubDepartmentFind = vi.mocked(prisma.subDepartment.findUnique)
const mockMembershipFind = vi.mocked(prisma.subDepartmentMembership.findUnique)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)

const baseTicket = {
  id: "ticket-1",
  title: "Fix the login bug",
  subDepartmentId: "team-source",
  assigneeId: "agent-1",
  deletedAt: null,
  subDepartment: { id: "team-source", name: "Billing", departmentId: "dept-A", tenantId: "tenant-1" },
}

const baseTargetSubDepartment = {
  id: "team-target",
  name: "Onboarding",
  prefix: "ONB",
  departmentId: "dept-B",
  tenantId: "tenant-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTicketFind.mockResolvedValue(baseTicket as never)
  mockSubDepartmentFind.mockResolvedValue(baseTargetSubDepartment as never)
  mockMembershipFind.mockResolvedValue(null as never)
  mockProfileFind.mockResolvedValue({ name: "Alice" } as never)
  mockTx.subDepartmentTicketCounter.upsert.mockResolvedValue({ subDepartmentId: "team-target", lastNumber: 7 } as never)
})

describe("transferTicket", () => {
  it("moves the ticket, renumbers, and clears a non-member assignee", async () => {
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(result).toEqual({
      ok: true,
      ticketId: "ticket-1",
      fromTeamId: "team-source",
      toTeamId: "team-target",
      newTicketNumber: 7,
      ticketTitle: "Fix the login bug",
      fromDepartmentId: "dept-A",
      fromSubDepartmentName: "Billing",
      toDepartmentId: "dept-B",
      toPrefix: "ONB",
      toSubDepartmentName: "Onboarding",
      actorName: "Alice",
    })
    expect(mockTx.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: {
        subDepartmentId: "team-target",
        ticketNumber: 7,
        assigneeId: null,
        transferredFromSubDepartmentId: "team-source",
        transferredFromName: "Billing",
        transferredById: "actor-1",
        transferredByName: "Alice",
        transferredAt: expect.any(Date),
      },
    })
  })

  it("keeps the assignee when they're an active member of the destination subDepartment", async () => {
    mockMembershipFind.mockResolvedValue({ isActive: true } as never)

    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: "agent-1" }) }),
    )
  })

  it("records a FORWARDED activity log entry with from/to subDepartment + department metadata", async () => {
    await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })

    expect(mockTx.activityLog.create).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        actorId: "actor-1",
        action: "FORWARDED",
        metadata: {
          fromTeamId: "team-source",
          fromSubDepartmentName: "Billing",
          fromDepartmentId: "dept-A",
          toTeamId: "team-target",
          toSubDepartmentName: "Onboarding",
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

  it("rejects an unknown destination subDepartment", async () => {
    mockSubDepartmentFind.mockResolvedValue(null as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "nope", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Destination subDepartment not found" })
  })

  it("rejects a destination subDepartment in a different tenant", async () => {
    mockSubDepartmentFind.mockResolvedValue({ ...baseTargetSubDepartment, tenantId: "tenant-2" } as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-target", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Destination subDepartment is outside this tenant" })
  })

  it("rejects transferring a ticket to the subDepartment it's already in", async () => {
    mockSubDepartmentFind.mockResolvedValue({ ...baseTargetSubDepartment, id: "team-source" } as never)
    const result = await transferTicket({ ticketId: "ticket-1", targetTeamId: "team-source", actorId: "actor-1" })
    expect(result).toEqual({ ok: false, error: "Ticket is already in that subDepartment" })
  })
})
