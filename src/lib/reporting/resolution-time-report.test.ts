import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { ticket: { findMany: vi.fn() } } }))

vi.mock("@/lib/sla-engine", () => ({ getSlaIndicatorForTicket: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/manual-resolution", () => ({ getManualResolutionTicket: vi.fn().mockResolvedValue(null), trackedWorkSeconds: vi.fn() }))
import { getSlaIndicatorForTicket } from "@/lib/sla-engine"
import { getManualResolutionTicket, trackedWorkSeconds } from "@/lib/manual-resolution"
import { prisma } from "@/lib/db"
import { computeResolutionTimeReport } from "./resolution-time-report"

const mockFindMany = vi.mocked(prisma.ticket.findMany)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSlaIndicatorForTicket).mockResolvedValue(null)
  vi.mocked(getManualResolutionTicket).mockResolvedValue(null)
})

describe("computeResolutionTimeReport", () => {
  it("uses the authoritative SLA elapsed time instead of the raw timestamp window", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sla-1", priority: "High",
        createdAt: new Date("2026-02-01T00:00:00Z"),
        closedAt: new Date("2026-02-01T04:00:00Z"),
        slaTimer: {
          resolutionStartedAt: new Date("2026-02-01T00:00:00Z"),
          resolutionStoppedAt: new Date("2026-02-01T01:00:00Z"), // 60 mins, not 240
        },
      },
    ] as never)

    vi.mocked(getSlaIndicatorForTicket).mockResolvedValue({ resolution: { elapsedMs: 60 * 60_000 } } as never)
    const result = await computeResolutionTimeReport(
      { kind: "department", tenantId: "tenant-1", subDepartmentIds: ["t1"] },
      new Date("2026-02-01"),
      new Date("2026-03-01"),
    )
    expect(result.current.High).toEqual({ count: 1, meanMins: 60, medianMins: 60 })
    expect(getSlaIndicatorForTicket).toHaveBeenCalledWith("sla-1", new Date("2026-02-01T04:00:00Z"), { readOnly: true })
  })

  it("falls back to createdAt→closedAt when there is no SlaTimer", async () => {
    mockFindMany.mockResolvedValue([
      {
        priority: "Low",
        createdAt: new Date("2026-02-01T00:00:00Z"),
        closedAt: new Date("2026-02-01T02:00:00Z"),
        slaTimer: null,
      },
    ] as never)

    const result = await computeResolutionTimeReport(
      { kind: "department", tenantId: "tenant-1", subDepartmentIds: ["t1"] },
      new Date("2026-02-01"),
      new Date("2026-03-01"),
    )
    expect(result.current.Low).toEqual({ count: 1, meanMins: 120, medianMins: 120 })
  })

  it("groups by priority and computes mean/median independently per priority", async () => {
    mockFindMany.mockResolvedValue([
      { priority: "High", createdAt: new Date("2026-02-01T00:00:00Z"), closedAt: new Date("2026-02-01T01:00:00Z"), slaTimer: null },
      { priority: "High", createdAt: new Date("2026-02-01T00:00:00Z"), closedAt: new Date("2026-02-01T03:00:00Z"), slaTimer: null },
      { priority: "Low", createdAt: new Date("2026-02-01T00:00:00Z"), closedAt: new Date("2026-02-01T10:00:00Z"), slaTimer: null },
    ] as never)

    const result = await computeResolutionTimeReport(
      { kind: "department", tenantId: "tenant-1", subDepartmentIds: ["t1"] },
      new Date("2026-02-01"),
      new Date("2026-03-01"),
    )
    expect(result.current.High).toEqual({ count: 2, meanMins: 120, medianMins: 120 })
    expect(result.current.Low).toEqual({ count: 1, meanMins: 600, medianMins: 600 })
  })

  it("filters by closedAt within the given range (resolved-in-period)", async () => {
    mockFindMany.mockResolvedValue([])
    const start = new Date("2026-02-01T00:00:00Z")
    const end = new Date("2026-03-01T00:00:00Z")
    await computeResolutionTimeReport({ kind: "department", tenantId: "tenant-1", subDepartmentIds: ["t1"] }, start, end)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ closedAt: { gte: start, lt: end } }) }),
    )
  })
})

it("uses current-cycle tracked seconds for manual reports, retaining fractional minutes", async () => {
  mockFindMany.mockResolvedValue([{ id: "manual", priority: "High", createdAt: new Date("2026-02-01"), closedAt: new Date("2026-02-02") }] as never)
  vi.mocked(getManualResolutionTicket).mockResolvedValue({ id: "manual" } as never)
  vi.mocked(trackedWorkSeconds).mockResolvedValue(61)
  const result = await computeResolutionTimeReport({ kind: "department", tenantId: "tenant", subDepartmentIds: ["sub"] }, new Date("2026-02-01"), new Date("2026-03-01"))
  expect(result.current.High.meanMins).toBe(61 / 60)
})
