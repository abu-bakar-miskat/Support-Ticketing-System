import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    memberHoliday: { findMany: vi.fn() },
    memberSchedule: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { getUnavailabilityByUserIds } from "./availability"

const mockHolidayFindMany = vi.mocked(prisma.memberHoliday.findMany)
const mockScheduleFindMany = vi.mocked(prisma.memberSchedule.findMany)
const mockProfileFindMany = vi.mocked(prisma.profile.findMany)

// Fixed instant: Monday 2026-01-05 12:00 UTC (dayOfWeek = 1, time = "12:00").
const NOW = new Date("2026-01-05T12:00:00.000Z")

/**
 * profile.findMany is called twice: once to list inactive members
 * (where.isActive === false) and once to resolve candidate tz/isActive.
 */
function setProfiles(opts: {
  inactive?: { id: string }[]
  candidates?: { id: string; timezone: string | null; isActive: boolean }[]
}) {
  mockProfileFindMany.mockImplementation(((args: { where?: { isActive?: boolean } }) => {
    if (args?.where?.isActive === false) return Promise.resolve(opts.inactive ?? [])
    return Promise.resolve(opts.candidates ?? [])
  }) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mockHolidayFindMany.mockResolvedValue([] as never)
  mockScheduleFindMany.mockResolvedValue([] as never)
  setProfiles({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe("getUnavailabilityByUserIds", () => {
  it("returns {} when explicitly asked for no users", async () => {
    expect(await getUnavailabilityByUserIds([])).toEqual({})
  })

  it("marks an inactive account as Unavailable", async () => {
    setProfiles({
      inactive: [{ id: "u1" }],
      candidates: [{ id: "u1", timezone: null, isActive: false }],
    })
    const map = await getUnavailabilityByUserIds()
    expect(map.u1).toMatchObject({ kind: "inactive", label: "Unavailable" })
  })

  it("marks a member on holiday today with an Away label", async () => {
    mockHolidayFindMany.mockResolvedValue([
      { userId: "u2", date: new Date("2026-01-05T00:00:00.000Z"), reason: "Annual leave" },
    ] as never)
    setProfiles({ candidates: [{ id: "u2", timezone: null, isActive: true }] })
    const map = await getUnavailabilityByUserIds()
    expect(map.u2).toMatchObject({ kind: "holiday", reason: "Annual leave" })
    expect(map.u2.label).toContain("Away")
  })

  it("marks a member as Off today when today is not a working day", async () => {
    // Monday (1) excluded from working days.
    mockScheduleFindMany.mockResolvedValue([
      { userId: "u3", workingDays: [2, 3, 4], workStartTime: "09:00", workEndTime: "17:00" },
    ] as never)
    setProfiles({ candidates: [{ id: "u3", timezone: null, isActive: true }] })
    const map = await getUnavailabilityByUserIds()
    expect(map.u3).toMatchObject({ kind: "off_hours", label: "Off today" })
  })

  it("marks a member Outside working hours when current time is before their start", async () => {
    // Monday is a working day, but 12:00 is before the 13:00 start.
    mockScheduleFindMany.mockResolvedValue([
      { userId: "u4", workingDays: [1], workStartTime: "13:00", workEndTime: "17:00" },
    ] as never)
    setProfiles({ candidates: [{ id: "u4", timezone: null, isActive: true }] })
    const map = await getUnavailabilityByUserIds()
    expect(map.u4).toMatchObject({ kind: "off_hours", label: "Outside working hours" })
  })

  it("does not mark a member who is within their working hours", async () => {
    mockScheduleFindMany.mockResolvedValue([
      { userId: "u5", workingDays: [1], workStartTime: "09:00", workEndTime: "17:00" },
    ] as never)
    setProfiles({ candidates: [{ id: "u5", timezone: null, isActive: true }] })
    const map = await getUnavailabilityByUserIds()
    expect(map.u5).toBeUndefined()
  })

  it("prioritises inactive over holiday and schedule", async () => {
    mockHolidayFindMany.mockResolvedValue([
      { userId: "u6", date: new Date("2026-01-05T00:00:00.000Z"), reason: "Leave" },
    ] as never)
    mockScheduleFindMany.mockResolvedValue([
      { userId: "u6", workingDays: [2], workStartTime: "09:00", workEndTime: "17:00" },
    ] as never)
    setProfiles({
      inactive: [{ id: "u6" }],
      candidates: [{ id: "u6", timezone: null, isActive: false }],
    })
    const map = await getUnavailabilityByUserIds()
    expect(map.u6.kind).toBe("inactive")
  })
})
