import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    ticket: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { resolveTicketIds } from "./resolve-refs"

const mockTeamFindMany = vi.mocked(prisma.team.findMany)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveTicketIds", () => {
  it("returns [] without querying when there are no refs", async () => {
    expect(await resolveTicketIds([])).toEqual([])
    expect(mockTeamFindMany).not.toHaveBeenCalled()
  })

  it("resolves refs through team prefix and ticket number", async () => {
    mockTeamFindMany.mockResolvedValue([{ id: "team-1", prefix: "DEV" }] as never)
    mockTicketFindMany.mockResolvedValue([{ id: "ticket-1" }] as never)

    const ids = await resolveTicketIds([{ prefix: "DEV", number: 42 }])

    expect(ids).toEqual(["ticket-1"])
    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ teamId: "team-1", ticketNumber: 42 }],
        deletedAt: null,
      },
      select: { id: true },
    })
  })

  it("drops refs whose prefix matches no team", async () => {
    mockTeamFindMany.mockResolvedValue([] as never)

    const ids = await resolveTicketIds([{ prefix: "NOPE", number: 1 }])

    expect(ids).toEqual([])
    expect(mockTicketFindMany).not.toHaveBeenCalled()
  })

  it("resolves refs across multiple teams", async () => {
    mockTeamFindMany.mockResolvedValue([
      { id: "team-1", prefix: "DEV" },
      { id: "team-2", prefix: "OPS" },
    ] as never)
    mockTicketFindMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }] as never)

    const ids = await resolveTicketIds([
      { prefix: "DEV", number: 1 },
      { prefix: "OPS", number: 2 },
    ])

    expect(ids).toEqual(["t1", "t2"])
    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { teamId: "team-1", ticketNumber: 1 },
          { teamId: "team-2", ticketNumber: 2 },
        ],
        deletedAt: null,
      },
      select: { id: true },
    })
  })
})
