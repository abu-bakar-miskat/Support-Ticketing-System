import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: { groupBy: vi.fn(), findMany: vi.fn() },
    tenant: { findMany: vi.fn() },
    subDepartment: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import {
  computeCrossTenantTicketDrilldown,
  computeCrossTenantVolumeReport,
  computeTenantDepartmentVolume,
} from "./cross-tenant-volume-report"

const mockGroupBy = vi.mocked(prisma.ticket.groupBy)
const mockTicketFindMany = vi.mocked(prisma.ticket.findMany)
const mockTenantFindMany = vi.mocked(prisma.tenant.findMany)
const mockSubDepartmentFindMany = vi.mocked(prisma.subDepartment.findMany)

const start = new Date("2026-08-24T00:00:00.000Z")
const end = new Date("2026-09-23T00:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TC-038 computeCrossTenantVolumeReport", () => {
  it("aggregates each tenant inside the date window and does not mix counts", async () => {
    mockGroupBy.mockResolvedValue([
      { tenantId: "tenant-a", _count: { _all: 4 } },
      { tenantId: "tenant-b", _count: { _all: 1 } },
    ] as never)
    mockTenantFindMany.mockResolvedValue([
      { id: "tenant-a", name: "Alpha" },
      { id: "tenant-b", name: "Beta" },
      { id: "tenant-c", name: "Gamma" },
    ] as never)

    const result = await computeCrossTenantVolumeReport(start, end)

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["tenantId"],
      where: { deletedAt: null, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    })
    expect(result).toEqual([
      { tenantId: "tenant-a", tenantName: "Alpha", count: 4 },
      { tenantId: "tenant-b", tenantName: "Beta", count: 1 },
      { tenantId: "tenant-c", tenantName: "Gamma", count: 0 },
    ])
  })
})

describe("TC-038 computeTenantDepartmentVolume", () => {
  it("groups a single tenant's tickets by department and keeps tenantId on both queries", async () => {
    mockGroupBy.mockResolvedValue([
      { subDepartmentId: "sub-a", _count: { _all: 2 } },
      { subDepartmentId: "sub-b", _count: { _all: 1 } },
    ] as never)
    mockSubDepartmentFindMany.mockResolvedValue([
      { id: "sub-a", departmentId: "dept-1", department: { name: "Support" } },
      { id: "sub-b", departmentId: "dept-1", department: { name: "Support" } },
    ] as never)

    const result = await computeTenantDepartmentVolume("tenant-b", start, end)

    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-b", deletedAt: null }),
      }),
    )
    expect(mockSubDepartmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-b" }),
      }),
    )
    expect(result).toEqual([{ departmentId: "dept-1", departmentName: "Support", count: 3 }])
  })
})

describe("TC-038 computeCrossTenantTicketDrilldown", () => {
  it("queries only the selected tenant inside the same window", async () => {
    mockTicketFindMany.mockResolvedValue([
      {
        id: "ticket-b",
        tenantId: "tenant-b",
        ticketNumber: 12,
        title: "Beta ticket",
        status: "Open",
        type: "Bug",
        category: "Bug",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        subDepartment: { prefix: "BET" },
      },
      {
        id: "ticket-a",
        tenantId: "tenant-a",
        ticketNumber: 3,
        title: "Should not leak",
        status: "Open",
        type: "Bug",
        category: null,
        createdAt: new Date("2026-09-02T00:00:00.000Z"),
        subDepartment: { prefix: "ALP" },
      },
    ] as never)

    const result = await computeCrossTenantTicketDrilldown("tenant-b", start, end)

    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-b",
          deletedAt: null,
          createdAt: { gte: start, lt: end },
        },
      }),
    )
    expect(result.map((row) => row.tenantId)).toEqual(["tenant-b"])
    expect(result).toEqual([
      {
        id: "ticket-b",
        tenantId: "tenant-b",
        humanId: "BET-12",
        title: "Beta ticket",
        status: "Open",
        type: "Bug",
        category: "Bug",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    ])
  })

  it("does not query when tenantId is empty", async () => {
    const result = await computeCrossTenantTicketDrilldown("", start, end)
    expect(result).toEqual([])
    expect(mockTicketFindMany).not.toHaveBeenCalled()
  })
})
