import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/reporting/volume-report", () => ({ computeVolumeReport: vi.fn() }))
vi.mock("@/lib/reporting/resolution-time-report", () => ({ computeResolutionTimeReport: vi.fn() }))
vi.mock("@/lib/reporting/custom-field-report", () => ({ computeCustomFieldReport: vi.fn() }))
vi.mock("@/lib/reporting/cross-department-report", () => ({ computeCrossDepartmentReport: vi.fn() }))

import { computeVolumeReport } from "@/lib/reporting/volume-report"
import { computeResolutionTimeReport } from "@/lib/reporting/resolution-time-report"
import { computeCustomFieldReport } from "@/lib/reporting/custom-field-report"
import { computeCrossDepartmentReport } from "@/lib/reporting/cross-department-report"
import { buildReportExportDoc } from "./export-doc"

const mockVolume = vi.mocked(computeVolumeReport)
const mockResolution = vi.mocked(computeResolutionTimeReport)
const mockCustomField = vi.mocked(computeCustomFieldReport)
const mockCrossDept = vi.mocked(computeCrossDepartmentReport)

const deptScope = { kind: "department" as const, subDepartmentIds: ["t1"] }
const params = { start: "2026-02-01", end: "2026-03-01" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("buildReportExportDoc", () => {
  it("builds a volume doc with one row per category/type bucket", async () => {
    mockVolume.mockResolvedValue({
      range: { start: new Date(), end: new Date() },
      precedingRange: { start: new Date(), end: new Date() },
      current: [{ category: "Bug", type: "Bug", count: 5 }],
      preceding: [],
    })
    const { doc, rowCount } = await buildReportExportDoc("volume", params, deptScope)
    expect(rowCount).toBe(1)
    expect(doc.sheets[0].rows).toEqual([{ category: "Bug", type: "Bug", count: 5 }])
  })

  it("builds a resolution-time doc with one row per priority", async () => {
    mockResolution.mockResolvedValue({
      range: { start: new Date(), end: new Date() },
      precedingRange: { start: new Date(), end: new Date() },
      current: { High: { count: 3, meanMins: 60, medianMins: 55 } },
      preceding: {},
    })
    const { doc, rowCount } = await buildReportExportDoc("resolution_time", params, deptScope)
    expect(rowCount).toBe(1)
    expect(doc.sheets[0].rows).toEqual([{ priority: "High", count: 3, meanMins: 60, medianMins: 55 }])
  })

  it("throws for custom_field without groupByFieldId", async () => {
    await expect(buildReportExportDoc("custom_field", params, deptScope)).rejects.toThrow(/groupByFieldId/)
  })

  it("builds a custom-field doc when groupByFieldId is given", async () => {
    mockCustomField.mockResolvedValue([{ value: "High", count: 2 }])
    const { doc, rowCount } = await buildReportExportDoc(
      "custom_field",
      { ...params, groupByFieldId: "severity" },
      deptScope,
    )
    expect(rowCount).toBe(1)
    expect(doc.sheets[0].rows).toEqual([{ value: "High", count: 2 }])
  })

  it("throws for cross_department without cross-department scope", async () => {
    await expect(buildReportExportDoc("cross_department", params, deptScope)).rejects.toThrow(/Project Admin/)
    expect(mockCrossDept).not.toHaveBeenCalled()
  })

  it("builds a cross-department doc with cross-department scope", async () => {
    mockCrossDept.mockResolvedValue([{ departmentId: "d1", departmentName: "Support", category: "Bug", count: 4 }])
    const { doc, rowCount } = await buildReportExportDoc("cross_department", params, {
      kind: "cross_department",
      tenantId: "tenant-1",
    })
    expect(rowCount).toBe(1)
    expect(mockCrossDept).toHaveBeenCalledWith("tenant-1", new Date(params.start), new Date(params.end))
    expect(doc.sheets[0].rows).toEqual([{ departmentName: "Support", category: "Bug", count: 4 }])
  })
})
