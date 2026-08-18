import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findMany: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/rota", () => ({
  isMemberAvailableNow: vi.fn(),
}))

import { prisma } from "@/lib/db"
import { isMemberAvailableNow } from "@/lib/rota"
import {
  AGENT_UNAVAILABLE_LABEL,
  applyAgentUnavailableLabel,
  clearAgentUnavailableLabel,
  syncAgentUnavailableFlagForUser,
  sweepAgentUnavailableFlags,
} from "./agent-unavailable"

const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)
const mockTicketUpdate = vi.mocked(prisma.ticket.update)
const mockIsAvailable = vi.mocked(isMemberAvailableNow)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("applyAgentUnavailableLabel / clearAgentUnavailableLabel", () => {
  it("adds the label idempotently", () => {
    expect(applyAgentUnavailableLabel([])).toEqual([AGENT_UNAVAILABLE_LABEL])
    expect(applyAgentUnavailableLabel(["Reopened", AGENT_UNAVAILABLE_LABEL])).toEqual([
      "Reopened",
      AGENT_UNAVAILABLE_LABEL,
    ])
  })

  it("removes the label, leaving everything else untouched", () => {
    expect(clearAgentUnavailableLabel(["Reopened", AGENT_UNAVAILABLE_LABEL])).toEqual(["Reopened"])
    expect(clearAgentUnavailableLabel(["Reopened"])).toEqual(["Reopened"])
  })
})

describe("syncAgentUnavailableFlagForUser", () => {
  it("flags open tickets when the assignee is unavailable", async () => {
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", subDepartmentId: "team-1", labels: [] },
      { id: "t2", subDepartmentId: "team-1", labels: ["Reopened"] },
    ] as never)
    mockIsAvailable.mockResolvedValue(false as never)

    const result = await syncAgentUnavailableFlagForUser("user-1")

    expect(result).toEqual({ flagged: 2, cleared: 0 })
    expect(mockTicketUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { labels: [AGENT_UNAVAILABLE_LABEL] },
    })
    expect(mockTicketUpdate).toHaveBeenCalledWith({
      where: { id: "t2" },
      data: { labels: ["Reopened", AGENT_UNAVAILABLE_LABEL] },
    })
  })

  it("clears the flag once the assignee is available again", async () => {
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", subDepartmentId: "team-1", labels: [AGENT_UNAVAILABLE_LABEL] },
    ] as never)
    mockIsAvailable.mockResolvedValue(true as never)

    const result = await syncAgentUnavailableFlagForUser("user-1")

    expect(result).toEqual({ flagged: 0, cleared: 1 })
    expect(mockTicketUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { labels: [] },
    })
  })

  it("is a no-op when nothing needs to change", async () => {
    mockTicketFindMany.mockResolvedValue([{ id: "t1", subDepartmentId: "team-1", labels: [] }] as never)
    mockIsAvailable.mockResolvedValue(true as never)

    const result = await syncAgentUnavailableFlagForUser("user-1")

    expect(result).toEqual({ flagged: 0, cleared: 0 })
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it("checks availability once per distinct team, not once per ticket", async () => {
    mockTicketFindMany.mockResolvedValue([
      { id: "t1", subDepartmentId: "team-1", labels: [] },
      { id: "t2", subDepartmentId: "team-1", labels: [] },
      { id: "t3", subDepartmentId: "team-2", labels: [] },
    ] as never)
    mockIsAvailable.mockResolvedValue(false as never)

    await syncAgentUnavailableFlagForUser("user-1")

    expect(mockIsAvailable).toHaveBeenCalledTimes(2)
  })

  it("never throws — swallows errors and returns zero counts", async () => {
    mockTicketFindMany.mockRejectedValue(new Error("db down"))
    await expect(syncAgentUnavailableFlagForUser("user-1")).resolves.toEqual({ flagged: 0, cleared: 0 })
  })
})

describe("sweepAgentUnavailableFlags", () => {
  it("syncs every distinct assignee with an open ticket", async () => {
    mockTicketFindMany
      .mockResolvedValueOnce([{ assigneeId: "user-1" }, { assigneeId: "user-2" }] as never)
      .mockResolvedValueOnce([{ id: "t1", subDepartmentId: "team-1", labels: [] }] as never)
      .mockResolvedValueOnce([{ id: "t2", subDepartmentId: "team-1", labels: [] }] as never)
    mockIsAvailable.mockResolvedValue(false as never)

    const result = await sweepAgentUnavailableFlags()

    expect(result).toEqual({ checked: 2, flagged: 2, cleared: 0 })
  })
})
