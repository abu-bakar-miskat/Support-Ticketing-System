import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ prisma: { ticket: { findMany: vi.fn() } } }))
vi.mock("@/lib/board-search", () => ({ resolveFormFieldTicketIds: vi.fn() }))

import { prisma } from "@/lib/db"
import { resolveFormFieldTicketIds } from "@/lib/board-search"
import { computeCustomFieldReport } from "./custom-field-report"

const mockFindMany = vi.mocked(prisma.ticket.findMany)
const mockResolveFormFieldTicketIds = vi.mocked(resolveFormFieldTicketIds)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("computeCustomFieldReport", () => {
  it("groups ticket counts by the requested field's submitted value", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", intake: { responses: [{ fieldId: "severity", value: "High" }] } },
      { id: "t2", intake: { responses: [{ fieldId: "severity", value: "High" }] } },
      { id: "t3", intake: { responses: [{ fieldId: "severity", value: "Low" }] } },
    ] as never)

    const result = await computeCustomFieldReport({
      scope: { kind: "department", subDepartmentIds: ["t1"] },
      start: new Date("2026-02-01"),
      end: new Date("2026-03-01"),
      groupByFieldId: "severity",
    })

    expect(result).toEqual([
      { value: "High", count: 2 },
      { value: "Low", count: 1 },
    ])
  })

  it("buckets tickets with no value for the field as '(no value)'", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", intake: { responses: [] } },
    ] as never)

    const result = await computeCustomFieldReport({
      scope: { kind: "department", subDepartmentIds: ["t1"] },
      start: new Date("2026-02-01"),
      end: new Date("2026-03-01"),
      groupByFieldId: "severity",
    })

    expect(result).toEqual([{ value: "(no value)", count: 1 }])
  })

  it("narrows to tickets matching the additional filters first", async () => {
    mockFindMany.mockResolvedValue([
      { id: "t1", intake: { responses: [{ fieldId: "severity", value: "High" }] } },
      { id: "t2", intake: { responses: [{ fieldId: "severity", value: "Low" }] } },
    ] as never)
    mockResolveFormFieldTicketIds.mockResolvedValue(["t1"])

    const result = await computeCustomFieldReport({
      scope: { kind: "department", subDepartmentIds: ["t1"] },
      start: new Date("2026-02-01"),
      end: new Date("2026-03-01"),
      groupByFieldId: "severity",
      filters: [{ fieldId: "region", value: "EU" }],
    })

    expect(result).toEqual([{ value: "High", count: 1 }])
  })
})
