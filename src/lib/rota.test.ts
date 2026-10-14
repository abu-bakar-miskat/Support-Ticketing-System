import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    subDepartmentMembership: { findMany: vi.fn(), findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    memberHoliday: { findFirst: vi.fn() },
    memberSchedule: { findUnique: vi.fn() },
    subDepartmentStatus: { findMany: vi.fn() },
    ticket: { count: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import {
  resolveAssignee,
  getEligibleMembers,
  getOpenTicketCounts,
  isMemberAvailableNow,
} from "./rota"

const mockMembershipFindMany = vi.mocked(prisma.subDepartmentMembership.findMany)
const mockMembershipFindUnique = vi.mocked(prisma.subDepartmentMembership.findUnique)
const mockProfileFind = vi.mocked(prisma.profile.findUnique)
const mockHolidayFind = vi.mocked(prisma.memberHoliday.findFirst)
const mockScheduleFind = vi.mocked(prisma.memberSchedule.findUnique)
const mockSubDepartmentStatuses = vi.mocked(prisma.subDepartmentStatus.findMany)
const mockTicketCount = vi.mocked(prisma.ticket.count)

const TEAM_ID = "team-1"

beforeEach(() => {
  vi.clearAllMocks()
  // Everyone is active, no doNotAssign, no holidays, no schedule restriction by default.
  mockProfileFind.mockResolvedValue({ timezone: null, isActive: true } as never)
  mockMembershipFindUnique.mockResolvedValue({ doNotAssign: false } as never)
  mockHolidayFind.mockResolvedValue(null as never)
  mockScheduleFind.mockResolvedValue(null as never)
  mockSubDepartmentStatuses.mockResolvedValue([{ label: "Done" }] as never)
})

describe("isMemberAvailableNow", () => {
  it("returns false when doNotAssign is set for the sub-department", async () => {
    mockMembershipFindUnique.mockResolvedValue({ doNotAssign: true } as never)
    expect(await isMemberAvailableNow("a", TEAM_ID)).toBe(false)
  })

  it("returns false on a non-working day", async () => {
    // Force "now" via a schedule that excludes every weekday — whichever day
    // Intl reports, includes() will fail.
    mockScheduleFind.mockResolvedValue({
      workingDays: [],
      workStartTime: "00:00",
      workEndTime: "23:59",
    } as never)
    expect(await isMemberAvailableNow("a", TEAM_ID)).toBe(false)
  })

  it("returns false outside working hours", async () => {
    // Impossible window: end before start means any wall-clock time is outside.
    mockScheduleFind.mockResolvedValue({
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      workStartTime: "23:59",
      workEndTime: "00:00",
    } as never)
    expect(await isMemberAvailableNow("a", TEAM_ID)).toBe(false)
  })

  it("returns false when the member is on holiday today", async () => {
    mockHolidayFind.mockResolvedValue({ id: "h1" } as never)
    expect(await isMemberAvailableNow("a", TEAM_ID)).toBe(false)
  })
})

describe("getEligibleMembers", () => {
  it("restricts the automatic assignment pool to agents and excludes scoped department managers", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "agent" }] as never)

    expect(await getEligibleMembers(TEAM_ID, null, true)).toEqual([{ userId: "agent" }])
    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: {
        subDepartmentId: TEAM_ID,
        isActive: true,
        role: "agent",
        user: {
          role: "agent",
          managedDepartments: {
            none: { department: { subDepartments: { some: { id: TEAM_ID } } } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    })
  })

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

  it("returns empty when no member is inside working hours (ASG-04 / WH-03)", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }] as never)
    // Everyone inactive at the profile level → isMemberAvailableNow() is false for all.
    mockProfileFind.mockResolvedValue({ timezone: null, isActive: false } as never)
    const result = await getEligibleMembers(TEAM_ID, null)
    expect(result).toEqual([])
  })

  it("excludes members marked doNotAssign or outside their schedule", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }] as never)
    mockMembershipFindUnique
      .mockResolvedValueOnce({ doNotAssign: true } as never) // a excluded
      .mockResolvedValueOnce({ doNotAssign: false } as never) // b ok
    mockScheduleFind.mockResolvedValue({
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      workStartTime: "00:00",
      workEndTime: "23:59",
    } as never)

    const result = await getEligibleMembers(TEAM_ID, null)
    expect(result.map((m) => m.userId)).toEqual(["b"])
  })
})

describe("getOpenTicketCounts", () => {
  it("counts open tickets excluding completion statuses, in input order", async () => {
    mockTicketCount.mockImplementation(((args: { where: { assigneeId: string } }) =>
      Promise.resolve(args.where.assigneeId === "a" ? 3 : 1)) as never)
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
    mockTicketCount.mockImplementation(((args: { where: { assigneeId: string } }) =>
      Promise.resolve(args.where.assigneeId === "a" ? 10 : 1)) as never)
    const result = await resolveAssignee(TEAM_ID, 0, 5, null)
    expect(result).toEqual({ userId: "b", nextPointer: 2 })
  })

  it("falls back to the least-loaded member when everyone is over threshold", async () => {
    mockMembershipFindMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }] as never)
    mockTicketCount.mockImplementation(((args: { where: { assigneeId: string } }) =>
      Promise.resolve(args.where.assigneeId === "a" ? 10 : 6)) as never)
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
