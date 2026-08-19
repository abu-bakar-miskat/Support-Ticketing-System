import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  prisma: { reportExportJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() } },
}))
vi.mock("@/lib/reporting/export-doc", () => ({ buildReportExportDoc: vi.fn() }))
vi.mock("@/lib/exports/to-csv", () => ({ buildCsv: vi.fn() }))
vi.mock("@/lib/exports/to-xlsx", () => ({ buildXlsx: vi.fn() }))
vi.mock("@/lib/exports/to-pdf", () => ({ buildPdf: vi.fn() }))

const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })) },
  })),
}))

import { prisma } from "@/lib/db"
import { buildReportExportDoc } from "@/lib/reporting/export-doc"
import { buildCsv } from "@/lib/exports/to-csv"
import {
  createReportExportJob,
  runReportExportJob,
  sweepStuckReportExportJobs,
} from "./report-export-job"

const mockCreate = vi.mocked(prisma.reportExportJob.create)
const mockFindUnique = vi.mocked(prisma.reportExportJob.findUnique)
const mockUpdate = vi.mocked(prisma.reportExportJob.update)
const mockFindMany = vi.mocked(prisma.reportExportJob.findMany)
const mockBuildDoc = vi.mocked(buildReportExportDoc)
const mockBuildCsv = vi.mocked(buildCsv)

const deptScope = { kind: "department" as const, subDepartmentIds: ["t1"] }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.example.com/report.csv" } })
})

describe("createReportExportJob", () => {
  it("snapshots reportParams and scope together into params", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" } as never)
    await createReportExportJob({
      tenantId: "t1",
      createdById: "u1",
      reportType: "volume",
      format: "CSV",
      reportParams: { start: "2026-02-01", end: "2026-03-01" },
      scope: deptScope,
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        params: { reportParams: { start: "2026-02-01", end: "2026-03-01" }, scope: deptScope },
      }),
    })
  })
})

const baseJob = {
  id: "job-1",
  tenantId: "t1",
  reportType: "volume",
  format: "CSV" as const,
  status: "PENDING" as const,
  params: { reportParams: { start: "2026-02-01", end: "2026-03-01" }, scope: deptScope },
  startedAt: null,
}

describe("runReportExportJob", () => {
  it("is a no-op for an already-completed job", async () => {
    mockFindUnique.mockResolvedValue({ ...baseJob, status: "COMPLETED" } as never)
    await runReportExportJob("job-1")
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("builds, renders, uploads, and records COMPLETED with the result url + row count", async () => {
    mockFindUnique.mockResolvedValue(baseJob as never)
    mockBuildDoc.mockResolvedValue({ doc: { title: "x", sheets: [] }, rowCount: 7 } as never)
    mockBuildCsv.mockReturnValue("csv,data")
    mockUpload.mockResolvedValue({ error: null })

    await runReportExportJob("job-1")

    expect(mockUpload).toHaveBeenCalledWith(
      "report-exports/t1/job-1.csv",
      expect.anything(),
      expect.objectContaining({ contentType: "text/csv; charset=utf-8" }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          resultUrl: "https://cdn.example.com/report.csv",
          rowCount: 7,
        }),
      }),
    )
  })

  it("records FAILED with the error message when the report build throws", async () => {
    mockFindUnique.mockResolvedValue(baseJob as never)
    mockBuildDoc.mockRejectedValue(new Error("Cross-department reports require Project Admin scope"))

    await runReportExportJob("job-1")

    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          failureReason: "Cross-department reports require Project Admin scope",
        }),
      }),
    )
  })

  it("records FAILED when the storage upload errors", async () => {
    mockFindUnique.mockResolvedValue(baseJob as never)
    mockBuildDoc.mockResolvedValue({ doc: { title: "x", sheets: [] }, rowCount: 1 } as never)
    mockBuildCsv.mockReturnValue("csv,data")
    mockUpload.mockResolvedValue({ error: { message: "bucket not found" } })

    await runReportExportJob("job-1")

    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", failureReason: "bucket not found" }) }),
    )
  })
})

describe("sweepStuckReportExportJobs", () => {
  it("resumes every pending or stale-running job", async () => {
    mockFindMany.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }] as never)
    mockFindUnique.mockResolvedValue({ ...baseJob, status: "COMPLETED" } as never)

    const count = await sweepStuckReportExportJobs()

    expect(count).toBe(2)
    expect(mockFindUnique).toHaveBeenCalledTimes(2)
  })
})
