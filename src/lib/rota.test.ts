import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    teamMembership: { findMany: vi.fn(), findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    memberHoliday: { findFirst: vi.fn() },
    memberSchedule: { findUnique: vi.fn() },
    teamStatus: { findMany: vi.fn() },
    ticket: { count: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { resolveAssignee, getEligibleMembers, getOpenTicketCounts } from "./rota"

const mockMembershipFindMany = vi.mocked(prisma.teamMembership.findMany)
const mockMembershipFindUnique = vi.mocked(prisma.teamMembership.findUnique)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockHolidayFind = vi.mocked(prisma.memberHoliday.findFirst)
const mockScheduleFind = vi.mocked(prisma.memberSchedule.findUnique)
const mockTeamStatuses = vi.mocked(prisma.teamStatus.findMany)
const mockTicketCount = vi.mocked(prisma.ticket.count)

const TEAM_ID = "team-1"

beforeEach(() => {
  vi.clearAllMocks()
  // Everyone is active, no doNotAssign, no holidays, no schedule restriction by default.
  mockProfileFind.mockResolvedValue({ timezone: null, isActive: true } as never)
  mockMembershipFindUnique.mockResolvedValue({ doNotAssign: false } as never)
  mockHolidayFind.mockResolvedValue(null as never)
  mockScheduleFind.mockResolvedValue(null as never)
  mockTeamStatuses.mockResolvedValue([{ label: "Done" }] as never)
})

describe("getEligibleMembers", () => {
  it("excludes the given user and orders by joinedAt", async () => {
    mockMembershipFindMany.mockResolvedValue([
      { userId: "a" }, { userId: "b" }, { userId: "manager" },
    ] as never)
    const result = await getEligibleMembers(TEAM_ID, "manager")
    expect(result.map((m) => m.userId)).toEqual(["a", "b"])
  })

  it("returns empty when there are no active members", async () => {
    mockMembershipFindMany.mockResolvedValue([] as never)
    expect(await getEligibleMembers(TEAM_ID, null)).toEqual([])
  })

  it("falls back to all active members when none are available right now", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }] as never)
    // Everyone inactive at the profile level → isMemberAvailableNow() is false for all.
    mockProfileFind.mockResolvedValue({ timezone: null, isActive: false } as never)
    const result = await getEligibleMembers(TEAM_ID, null)
    expect(result.map((m) => m.userId).sort()).toEqual(["a", "b"])
  })
})

describe("getOpenTicketCounts", () => {
  it("counts open tickets excluding completion statuses, in input order", async () => {
    mockTicketCount.mockImplementation(async ({ where }: never) =>
      (where as { assigneeId: string }).assigneeId === "a" ? 3 : 1,
    )
    const result = await getOpenTicketCounts(TEAM_ID, ["a", "b"])
    expect(result).toEqual([{ userId: "a", count: 3 }, { userId: "b", count: 1 }])
    expect(mockTicketCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ["Done"] } }) }),
    )
  })
})

describe("resolveAssignee — hybrid round-robin + workload threshold (regression, unchanged behavior)", () => {
  it("assigns to the pointer's member when under threshold", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }] as never)
    mockTicketCount.mockResolvedValue(1 as never) // everyone under threshold=5
    const result = await resolveAssignee(TEAM_ID, 1, 5, null)
    expect(result).toEqual({ userId: "b", nextPointer: 2 })
  })

  it("skips over-threshold members and picks the next eligible one", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }] as never)
    mockTicketCount.mockImplementation(async ({ where }: never) =>
      (where as { assigneeId: string }).assigneeId === "a" ? 10 : 1,
    )
    const result = await resolveAssignee(TEAM_ID, 0, 5, null)
    expect(result).toEqual({ userId: "b", nextPointer: 2 })
  })

  it("falls back to the least-loaded member when everyone is over threshold", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }] as never)
    mockTicketCount.mockImplementation(async ({ where }: never) =>
      (where as { assigneeId: string }).assigneeId === "a" ? 10 : 6,
    )
    const result = await resolveAssignee(TEAM_ID, 0, 5, null)
    expect(result).toEqual({ userId: "b", nextPointer: 0 })
  })

  it("returns null with unchanged pointer when there are no members", async () => {
    mockMembershipFindMany.mockResolvedValue([] as never)
    const result = await resolveAssignee(TEAM_ID, 3, 5, null)
    expect(result).toEqual({ userId: null, nextPointer: 3 })
  })

  it("excludes the given manager id from the pool", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "manager" }, { userId: "a" }] as never)
    mockTicketCount.mockResolvedValue(0 as never)
    const result = await resolveAssignee(TEAM_ID, 0, 5, "manager")
    expect(result.userId).toBe("a")
  })
})
