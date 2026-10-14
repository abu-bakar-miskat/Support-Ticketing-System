import type { ExportDoc, ExportSheet } from "./report-doc"
import type { PlatformReportsResponse, OrganizationReportRow, PlatformTenantCardsResponse } from "@/lib/api/platform-reports"
import { formatPerformanceDuration } from "@/lib/reporting/user-performance"

export function buildPlatformReportsExportDoc(report: PlatformReportsResponse, rangeLabel: string, scopeLabel: string): ExportDoc {
  const sheet = (name: string, rows: OrganizationReportRow[]): ExportSheet => ({
    name,
    columns: [
      { key: "name", header: "Organization", width: 28 }, { key: "tenantName", header: "Tenant", width: 26 }, { key: "departmentName", header: "Department", width: 26 },
      { key: "created", header: "Created", width: 12 }, { key: "completed", header: "Completed", width: 12 }, { key: "openCreated", header: "Open from period", width: 18 },
      { key: "slaMet", header: "Resolution SLA met", width: 18 }, { key: "slaBreached", header: "SLA breached", width: 16 }, { key: "slaPending", header: "SLA pending", width: 16 }, { key: "noPolicy", header: "No SLA policy", width: 16 },
      { key: "avgCompletion", header: "Avg completion time", width: 24 }, { key: "completionSamples", header: "Completion samples", width: 18 },
    ],
    rows: rows.map((row) => ({ ...row, avgCompletion: formatPerformanceDuration(row.avgCompletionSecs) })),
  })
  return { title: "Platform organizational report", subtitle: `${rangeLabel} · ${scopeLabel} · Created counts use creation dates; completions use completion dates. Open counts refer to tickets created in the period. Resolution SLA outcomes cover these tickets; pending and no-policy tickets are excluded from the met rate.`,
    sheets: [sheet("Tenants", report.tenantReports), sheet("Departments", report.departmentReports), sheet("Subdepartments", report.subDepartmentReports)] }
}

export function buildTenantCardsExportDoc(report: PlatformTenantCardsResponse, rangeLabel: string): ExportDoc {
  return { title: "Tenant summaries", subtitle: `${rangeLabel} · Tickets created in period; department and subdepartment counts reflect the current structure.`, sheets: [{
    name: "Tenants", columns: [
      { key: "name", header: "Tenant", width: 30 }, { key: "type", header: "Type", width: 16 }, { key: "status", header: "Status", width: 16 },
      { key: "ticketCount", header: "Tickets created", width: 18 }, { key: "departmentCount", header: "Departments", width: 16 }, { key: "subDepartmentCount", header: "Subdepartments", width: 18 },
    ], rows: report.tenants.map((tenant) => ({ ...tenant })),
  }] }
}
