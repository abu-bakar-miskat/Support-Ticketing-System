import type { ExportDoc } from "@/lib/exports/report-doc"

export type SubDepartmentMember = {
  id: string
  name: string
  role: string
  location: string
  avatarColor: string
  avatarUrl?: string | null
  weekHours: string
  weekProgress: number
  dailyBars: number[]
  topProject: string
  projectColor: string
  closed: number
  active: string
  activeNow: boolean
}

export type StatCard = {
  label: string
  value: string
  detail: string
  detailClassName?: string
}

export type ProjectTimeRow = {
  name: string
  color: string
  hours: string
  secs: number
  share: number
  contributors: number
}

export type SubDepartmentTimeResponse = {
  stats: StatCard[]
  members: SubDepartmentMember[]
  projects: ProjectTimeRow[]
}

export async function fetchSubDepartmentTimeReport(
  from: string,
  to: string,
  projectId = "all",
  personId = "all",
  departmentId = "all",
): Promise<SubDepartmentTimeResponse> {
  const res = await fetch(
    `/api/reports/sub-department-time?from=${from}&to=${to}&projectId=${encodeURIComponent(projectId)}&personId=${encodeURIComponent(personId)}&departmentId=${encodeURIComponent(departmentId)}`,
  )
  if (!res.ok) throw new Error("Failed to fetch subDepartment time report")
  return res.json()
}

export type NamedCount = { name: string; count: number }
export type ModuleSpeed = { module: string; days: number }
export type CommentExtreme = { humanId: string; count: number }
export type CommentLoad = {
  module: string
  least: CommentExtreme | null
  most: CommentExtreme | null
}

export type DistSlice = { label: string; count: number; color: string }
export type ProjectTickets = {
  project: string
  color: string
  open: number
  total: number
}

export type ModuleTickets = {
  module: string
  open: number
  total: number
}

export type ProjectOption = { id: string; name: string }
export type MemberOption = { id: string; name: string; avatarUrl: string | null }

export type TicketSourceCounts = {
  manual: number
  support: number
  portal: number
  mailbox: number
}

export type PersonTicketPerformance = {
  personId: string | null
  name: string
  assigned: number
  completed: number
  slaMet: number
  slaMissed: number
  slaPending: number
  noSla: number
}

export type SlaOutcomeCounts = { met: number; breached: number; pending: number; noPolicy: number }
export type UserPerformance = {
  personId: string | null
  name: string
  assigned: number
  completed: number
  priorities: Record<string, number>
  responseSla: SlaOutcomeCounts
  resolutionSla: SlaOutcomeCounts
  avgReplySecs: number | null
  avgCompletionSecs: number | null
  avgSlaResolutionSecs: number | null
  replySamples: number
  completionSamples: number
  slaResolutionSamples: number
  score: number | null
  rank: number | null
}
export type PerformanceTicketDetail = {
  id: string
  ticket: string
  title: string
  people: string
  priority: string
  completedAt: string | null
  repliedAt: string | null
  responseSla: string
  resolutionSla: string
  replySecs: number | null
  completionSecs: number | null
  slaResolutionSecs: number | null
}

export type CrossDeptDeptBreakdown = {
  departmentName: string
  created: number
  completed: number
  loggedSecs: number
}
export type CrossDeptContribution = {
  personId: string
  name: string
  avatarUrl: string | null
  created: number
  completed: number
  loggedSecs: number
  byDepartment: CrossDeptDeptBreakdown[]
}

export type ReportsOverview = {
  created: NamedCount[]
  resolved: NamedCount[]
  bugResolution: ModuleSpeed[]
  commentLoad: CommentLoad[]
  statusDist: DistSlice[]
  priorityDist: DistSlice[]
  workload: NamedCount[]
  projectTickets: ProjectTickets[]
  moduleTickets: ModuleTickets[]
  totals: { open: number; closed: number; total: number }
  ticketSources: TicketSourceCounts
  personPerformance: PersonTicketPerformance[]
  userPerformance: UserPerformance[]
  performanceDetails: PerformanceTicketDetail[]
  projectOptions: ProjectOption[]
  memberOptions: MemberOption[]
  crossDept: CrossDeptContribution[]
}

export async function fetchReportsOverview(
  from: string,
  to: string,
  projectId = "all",
  personId = "all",
  departmentId = "all",
): Promise<ReportsOverview> {
  const res = await fetch(
    `/api/reports/overview?from=${from}&to=${to}&projectId=${encodeURIComponent(projectId)}&personId=${encodeURIComponent(personId)}&departmentId=${encodeURIComponent(departmentId)}`,
  )
  if (!res.ok) throw new Error("Failed to fetch reports overview")
  return res.json()
}

export type ReportExportFormat = "excel" | "pdf" | "csv"

/** POSTs an already-assembled ExportDoc and downloads the returned file. */
export async function exportReports(
  doc: ExportDoc,
  format: ReportExportFormat,
  fileBase = "reports",
): Promise<void> {
  const res = await fetch(`/api/reports/export?format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc, fileBase }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? "Failed to export reports")
  }

  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="([^"]+)"/)
  const fileName = match?.[1] ?? `${fileBase}.${format === "excel" ? "xlsx" : format}`

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
