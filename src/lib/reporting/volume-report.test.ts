import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { ticket: { groupBy: vi.fn() } } }))

import { prisma } from "@/lib/db"
import { computeVolumeReport } from "./volume-report"

const mockGroupBy = vi.mocked(prisma.ticket.groupBy)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("computeVolumeReport", () => {
  it("scopes by subDepartmentIds for a department scope", async () => {
    mockGroupBy.mockResolvedValue([])
    await computeVolumeReport({ kind: "department", subDepartmentIds: ["t1", "t2"] }, new Date("2026-02-01"), new Date("2026-03-01"))
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subDepartmentId: { in: ["t1", "t2"] } }) }),
    )
  })

  it("scopes by tenantId for a cross-department scope", async () => {
    mockGroupBy.mockResolvedValue([])
    await computeVolumeReport({ kind: "cross_department", tenantId: "tenant-1" }, new Date("2026-02-01"), new Date("2026-03-01"))
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }),
    )
  })

  it("matches nothing for a 'none' scope", async () => {
    mockGroupBy.mockResolvedValue([])
    await computeVolumeReport({ kind: "none" }, new Date("2026-02-01"), new Date("2026-03-01"))
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "__none__" }) }),
    )
  })

  it("computes both the current and preceding-equivalent range", async () => {
    mockGroupBy.mockResolvedValue([])
    const start = new Date("2026-02-01T00:00:00.000Z")
    const end = new Date("2026-03-01T00:00:00.000Z")
    const result = await computeVolumeReport({ kind: "department", subDepartmentIds: ["t1"] }, start, end)
    expect(result.range).toEqual({ start, end })
    expect(result.precedingRange.end).toEqual(start)
    expect(mockGroupBy).toHaveBeenCalledTimes(2)
  })

  it("normalizes a null category to 'Uncategorized' and maps _count._all to count", async () => {
    mockGroupBy.mockResolvedValue([
      { category: "Bug", type: "Bug", _count: { _all: 5 } },
      { category: null, type: "Task", _count: { _all: 2 } },
    ] as never)
    const result = await computeVolumeReport({ kind: "department", subDepartmentIds: ["t1"] }, new Date("2026-02-01"), new Date("2026-03-01"))
    expect(result.current).toEqual([
      { category: "Bug", type: "Bug", count: 5 },
      { category: "Uncategorized", type: "Task", count: 2 },
    ])
  })
})
