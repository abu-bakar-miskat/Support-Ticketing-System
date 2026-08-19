import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticketMessage: { findMany: vi.fn() },
    intake: { findMany: vi.fn() },
    ticket: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { resolveSubStatusTicketIds, resolveFormFieldTicketIds, resolveSearchTicketIds } from "./board-search"

const mockMessageFindMany = vi.mocked(prisma.ticketMessage.findMany)
const mockIntakeFindMany = vi.mocked(prisma.intake.findMany)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveSubStatusTicketIds", () => {
  it("matches tickets whose latest non-system message is inbound (WAITING_FOR_SUPPORT)", async () => {
    mockMessageFindMany.mockResolvedValue([
      { ticketId: "t1", direction: "outbound", status: "trusted", createdAt: new Date("2026-01-01") },
      { ticketId: "t1", direction: "inbound", status: "trusted", createdAt: new Date("2026-01-02") },
      { ticketId: "t2", direction: "outbound", status: "trusted", createdAt: new Date("2026-01-01") },
    ] as never)

    const result = await resolveSubStatusTicketIds(["WAITING_FOR_SUPPORT"])
    expect(result).toEqual(["t1"])
  })

  it("ignores system messages when deriving the latest", async () => {
    mockMessageFindMany.mockResolvedValue([
      { ticketId: "t1", direction: "outbound", status: "trusted", createdAt: new Date("2026-01-01") },
      { ticketId: "t1", direction: "inbound", status: "system", createdAt: new Date("2026-01-05") },
    ] as never)

    const result = await resolveSubStatusTicketIds(["WAITING_FOR_CUSTOMER"])
    expect(result).toEqual(["t1"])
  })

  it("narrows to candidateTicketIds when given", async () => {
    mockMessageFindMany.mockResolvedValue([])
    await resolveSubStatusTicketIds(["WAITING_FOR_SUPPORT"], ["t1", "t2"])
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticketId: { in: ["t1", "t2"] } } }),
    )
  })

  it("short-circuits to the candidate list unchanged when no sub-statuses requested", async () => {
    const result = await resolveSubStatusTicketIds([], ["t1", "t2"])
    expect(result).toEqual(["t1", "t2"])
    expect(mockMessageFindMany).not.toHaveBeenCalled()
  })

  it("short-circuits to empty when candidates are already empty", async () => {
    const result = await resolveSubStatusTicketIds(["WAITING_FOR_SUPPORT"], [])
    expect(result).toEqual([])
    expect(mockMessageFindMany).not.toHaveBeenCalled()
  })
})

describe("resolveFormFieldTicketIds", () => {
  it("matches a ticket whose responses satisfy every requested field/value pair", async () => {
    mockIntakeFindMany.mockResolvedValue([
      { ticketId: "t1", responses: [{ fieldId: "f1", value: "Yes" }, { fieldId: "f2", value: "Urgent" }] },
      { ticketId: "t2", responses: [{ fieldId: "f1", value: "No" }] },
    ] as never)

    const result = await resolveFormFieldTicketIds([{ fieldId: "f1", value: "yes" }])
    expect(result).toEqual(["t1"])
  })

  it("requires ALL filters to match (AND semantics)", async () => {
    mockIntakeFindMany.mockResolvedValue([
      { ticketId: "t1", responses: [{ fieldId: "f1", value: "Yes" }] },
    ] as never)

    const result = await resolveFormFieldTicketIds([
      { fieldId: "f1", value: "Yes" },
      { fieldId: "f2", value: "Urgent" },
    ])
    expect(result).toEqual([])
  })

  it("skips intake rows with no linked ticket", async () => {
    mockIntakeFindMany.mockResolvedValue([{ ticketId: null, responses: [] }] as never)
    const result = await resolveFormFieldTicketIds([{ fieldId: "f1", value: "x" }])
    expect(result).toEqual([])
  })

  it("short-circuits to the candidate list when no filters requested", async () => {
    const result = await resolveFormFieldTicketIds([], ["t1"])
    expect(result).toEqual(["t1"])
    expect(mockIntakeFindMany).not.toHaveBeenCalled()
  })
})

describe("resolveSearchTicketIds", () => {
  it("unions title, human-id reference, requester email, and message matches", async () => {
    mockTicketFindMany.mockResolvedValue([{ id: "t1" }] as never)
    mockIntakeFindMany.mockResolvedValue([{ ticketId: "t2" }] as never)
    mockMessageFindMany.mockResolvedValue([{ ticketId: "t3" }] as never)

    const result = await resolveSearchTicketIds("jane")
    expect(result.sort()).toEqual(["t1", "t2", "t3"])
  })

  it("parses a human-id-style query into a team-prefix + ticket-number match", async () => {
    mockTicketFindMany.mockResolvedValue([] as never)
    mockIntakeFindMany.mockResolvedValue([] as never)
    mockMessageFindMany.mockResolvedValue([] as never)

    await resolveSearchTicketIds("SUP-42")

    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              subDepartment: { prefix: { equals: "SUP", mode: "insensitive" } },
              ticketNumber: 42,
            }),
          ]),
        }),
      }),
    )
  })

  it("deduplicates a ticket matched by more than one source", async () => {
    mockTicketFindMany.mockResolvedValue([{ id: "t1" }] as never)
    mockIntakeFindMany.mockResolvedValue([{ ticketId: "t1" }] as never)
    mockMessageFindMany.mockResolvedValue([] as never)

    const result = await resolveSearchTicketIds("jane")
    expect(result).toEqual(["t1"])
  })

  it("short-circuits to the candidate list for an empty/whitespace search", async () => {
    const result = await resolveSearchTicketIds("   ", ["t1"])
    expect(result).toEqual(["t1"])
    expect(mockTicketFindMany).not.toHaveBeenCalled()
  })

  it("short-circuits to empty when candidates are already empty", async () => {
    const result = await resolveSearchTicketIds("jane", [])
    expect(result).toEqual([])
    expect(mockTicketFindMany).not.toHaveBeenCalled()
  })
})
