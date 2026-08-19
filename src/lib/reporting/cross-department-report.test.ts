import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: { ticket: { groupBy: vi.fn() }, subDepartment: { findMany: vi.fn() } },
}))

import { prisma } from "@/lib/db"
import { computeCrossDepartmentReport } from "./cross-department-report"

const mockGroupBy = vi.mocked(prisma.ticket.groupBy)
const mockTeamFindMany = vi.mocked(prisma.subDepartment.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("computeCrossDepartmentReport", () => {
  it("aggregates counts by department + category across teams", async () => {
    mockGroupBy.mockResolvedValue([
      { subDepartmentId: "team-a", category: "Bug", _count: { _all: 3 } },
      { subDepartmentId: "team-b", category: "Bug", _count: { _all: 2 } }, // same category, different dept
    ] as never)
    mockTeamFindMany.mockResolvedValue([
      { id: "team-a", departmentId: "dept-1", department: { name: "Support" } },
      { id: "team-b", departmentId: "dept-2", department: { name: "Billing" } },
    ] as never)

    const result = await computeCrossDepartmentReport("tenant-1", new Date("2026-02-01"), new Date("2026-03-01"))

    expect(result).toEqual(
      expect.arrayContaining([
        { departmentId: "dept-1", departmentName: "Support", category: "Bug", count: 3 },
        { departmentId: "dept-2", departmentName: "Billing", category: "Bug", count: 2 },
      ]),
    )
  })

  it("merges rows from two teams in the SAME department under one bucket", async () => {
    mockGroupBy.mockResolvedValue([
      { subDepartmentId: "team-a", category: "Bug", _count: { _all: 3 } },
      { subDepartmentId: "team-a2", category: "Bug", _count: { _all: 4 } },
    ] as never)
    mockTeamFindMany.mockResolvedValue([
      { id: "team-a", departmentId: "dept-1", department: { name: "Support" } },
      { id: "team-a2", departmentId: "dept-1", department: { name: "Support" } },
    ] as never)

    const result = await computeCrossDepartmentReport("tenant-1", new Date("2026-02-01"), new Date("2026-03-01"))

    expect(result).toEqual([{ departmentId: "dept-1", departmentName: "Support", category: "Bug", count: 7 }])
  })

  it("normalizes a null category to 'Uncategorized'", async () => {
    mockGroupBy.mockResolvedValue([{ subDepartmentId: "team-a", category: null, _count: { _all: 1 } }] as never)
    mockTeamFindMany.mockResolvedValue([
      { id: "team-a", departmentId: "dept-1", department: { name: "Support" } },
    ] as never)

    const result = await computeCrossDepartmentReport("tenant-1", new Date("2026-02-01"), new Date("2026-03-01"))
    expect(result[0].category).toBe("Uncategorized")
  })

  it("returns [] with no team lookup when there are no matching tickets", async () => {
    mockGroupBy.mockResolvedValue([])
    const result = await computeCrossDepartmentReport("tenant-1", new Date("2026-02-01"), new Date("2026-03-01"))
    expect(result).toEqual([])
    expect(mockTeamFindMany).not.toHaveBeenCalled()
  })

  it("scopes the groupBy query to the given tenant", async () => {
    mockGroupBy.mockResolvedValue([])
    await computeCrossDepartmentReport("tenant-1", new Date("2026-02-01"), new Date("2026-03-01"))
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }) }),
    )
  })
})
