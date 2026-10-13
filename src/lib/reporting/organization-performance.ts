import type { OrganizationMetrics, OrganizationReportRow, PlatformReportsResponse } from "@/lib/api/platform-reports"

export function emptyOrganizationMetrics(): OrganizationMetrics {
  return { created: 0, completed: 0, openCreated: 0, slaMet: 0, slaBreached: 0, slaPending: 0, noPolicy: 0, avgCompletionSecs: null, completionSamples: 0 }
}

export type OrganizationTicketSample = {
  tenantId: string
  departmentId: string
  subDepartmentId: string
  createdAt: Date
  closedAt: Date | null
  complete: boolean
  resolutionOutcome: "met" | "breached" | "pending" | "noPolicy"
}

/** Each ticket contributes once per organizational level, irrespective of assignee count. */
export function summarizeOrganizationPerformance(
  options: Pick<PlatformReportsResponse, "tenants" | "departments" | "subDepartments">,
  tickets: OrganizationTicketSample[], start: Date, end: Date,
): Pick<PlatformReportsResponse, "summary" | "tenantReports" | "departmentReports" | "subDepartmentReports"> {
  const tenantNames = new Map(options.tenants.map((tenant) => [tenant.id, tenant.name]))
  const departmentNames = new Map(options.departments.map((department) => [department.id, department.name]))
  const tenantReports: OrganizationReportRow[] = options.tenants.map((tenant) => ({ ...emptyOrganizationMetrics(), id: tenant.id, name: tenant.name, tenantId: tenant.id, tenantName: tenant.name }))
  const departmentReports: OrganizationReportRow[] = options.departments.map((department) => ({ ...emptyOrganizationMetrics(), ...department, tenantName: tenantNames.get(department.tenantId) ?? "Tenant" }))
  const subDepartmentReports: OrganizationReportRow[] = options.subDepartments.map((sub) => ({ ...emptyOrganizationMetrics(), ...sub, tenantName: tenantNames.get(sub.tenantId) ?? "Tenant", departmentName: departmentNames.get(sub.departmentId) ?? "Department" }))
  const tenantById = new Map(tenantReports.map((row) => [row.id, row]))
  const departmentById = new Map(departmentReports.map((row) => [row.id, row]))
  const subById = new Map(subDepartmentReports.map((row) => [row.id, row]))
  const summary = emptyOrganizationMetrics()
  const inPeriod = (date: Date | null) => !!date && date >= start && date < end
  for (const ticket of tickets) {
    if (!tenantById.has(ticket.tenantId)) continue
    const created = inPeriod(ticket.createdAt)
    const completed = ticket.complete && inPeriod(ticket.closedAt)
    if (!created && !completed) continue
    for (const metric of [summary, tenantById.get(ticket.tenantId), departmentById.get(ticket.departmentId), subById.get(ticket.subDepartmentId)]) {
      if (!metric) continue
      if (created) { metric.created++; if (!ticket.complete) metric.openCreated++ }
      if (completed) {
        metric.completed++
        const seconds = Math.max(0, (ticket.closedAt!.getTime() - ticket.createdAt.getTime()) / 1000)
        metric.avgCompletionSecs = ((metric.avgCompletionSecs ?? 0) * metric.completionSamples + seconds) / (metric.completionSamples + 1)
        metric.completionSamples++
      }
      if (ticket.resolutionOutcome === "met") metric.slaMet++
      else if (ticket.resolutionOutcome === "breached") metric.slaBreached++
      else if (ticket.resolutionOutcome === "pending") metric.slaPending++
      else metric.noPolicy++
    }
  }
  const sort = (rows: OrganizationReportRow[]) => rows.sort((a, b) => b.created - a.created || b.completed - a.completed || a.name.localeCompare(b.name))
  return { summary, tenantReports: sort(tenantReports), departmentReports: sort(departmentReports), subDepartmentReports: sort(subDepartmentReports) }
}
