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
  qaStats: StatCard[]
  qaProjects: ProjectTimeRow[]
  qaMembers: SubDepartmentMember[]
}

export async function fetchSubDepartmentTimeReport(
  from: string,
  to: string,
  projectId = "all",
  personId = "all",
): Promise<SubDepartmentTimeResponse> {
  const res = await fetch(
    `/api/reports/sub-department-time?from=${from}&to=${to}&projectId=${encodeURIComponent(projectId)}&personId=${encodeURIComponent(personId)}`,
  )
  if (!res.ok) throw new Error("Failed to fetch team time report")
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
  qaResolved: NamedCount[]
  qaWorkload: NamedCount[]
  projectTickets: ProjectTickets[]
  moduleTickets: ModuleTickets[]
  totals: { open: number; closed: number; total: number }
  projectOptions: ProjectOption[]
  memberOptions: MemberOption[]
  crossDept: CrossDeptContribution[]
}

export async function fetchReportsOverview(
  from: string,
  to: string,
  projectId = "all",
  personId = "all",
): Promise<ReportsOverview> {
  const res = await fetch(
    `/api/reports/overview?from=${from}&to=${to}&projectId=${encodeURIComponent(projectId)}&personId=${encodeURIComponent(personId)}`,
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
