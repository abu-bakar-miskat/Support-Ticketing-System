import { expect, it } from "vitest"
import { summarizeOrganizationPerformance, type OrganizationTicketSample } from "./organization-performance"
import { buildPlatformReportsExportDoc, buildTenantCardsExportDoc } from "@/lib/exports/platform-reports-export-doc"

const options = {
  tenants: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
  departments: [{ id: "d", name: "Support", tenantId: "a" }],
  subDepartments: [{ id: "s", name: "Helpdesk", tenantId: "a", departmentId: "d" }],
}
const start = new Date("2026-10-01T00:00:00Z"), end = new Date("2026-10-13T00:00:00Z")
const sample = (overrides: Partial<OrganizationTicketSample> = {}): OrganizationTicketSample => ({ tenantId: "a", departmentId: "d", subDepartmentId: "s", createdAt: start, closedAt: null, complete: false, resolutionOutcome: "pending", ...overrides })

it("separates creation and completion cohorts, includes older completions, and excludes the end boundary", () => {
  const result = summarizeOrganizationPerformance(options, [
    sample(),
    sample({ createdAt: new Date("2026-09-30T00:00:00Z"), closedAt: new Date("2026-10-02T00:00:00Z"), complete: true, resolutionOutcome: "met" }),
    sample({ closedAt: new Date("2026-10-03T00:00:00Z"), complete: true, resolutionOutcome: "breached" }),
    sample({ createdAt: end }),
    sample({ tenantId: "deleted" }),
  ], start, end)
  expect(result.summary).toMatchObject({ created: 2, completed: 2, openCreated: 1, slaMet: 1, slaBreached: 1, slaPending: 1, avgCompletionSecs: 172800, completionSamples: 2 })
  expect(result.tenantReports[1]).toMatchObject({ id: "b", created: 0, completed: 0, avgCompletionSecs: null })
  expect(result.departmentReports[0].completed).toBe(2)
  expect(result.subDepartmentReports[0].completed).toBe(2)
})

it("exports only the three organizational report levels", () => {
  const report = { ...options, ...summarizeOrganizationPerformance(options, [sample()], start, end) }
  const doc = buildPlatformReportsExportDoc(report, "1–12 Oct 2026", "All tenants")
  expect(doc.sheets.map((sheet) => sheet.name)).toEqual(["Tenants", "Departments", "Subdepartments"])
  expect(doc.sheets[0].rows[0]).toMatchObject({ name: "Alpha", created: 1 })
  expect(JSON.stringify(doc)).not.toMatch(/assignee|personId|userPerformance|Person Performance|Ticket Timing Details/)
})

it("exports only lightweight tenant summaries before a tenant is opened", () => {
  const doc = buildTenantCardsExportDoc({ mode: "tenants", tenants: [{ id: "a", name: "Alpha", type: "company", status: "active", ticketCount: 3, departmentCount: 2, subDepartmentCount: 4 }] }, "1–12 Oct 2026")
  expect(doc.sheets.map((sheet) => sheet.name)).toEqual(["Tenants"])
  expect(doc.sheets[0].rows[0]).toMatchObject({ name: "Alpha", ticketCount: 3, departmentCount: 2, subDepartmentCount: 4 })
})
