import { apiFetch } from "@/lib/api/http"

export type SprintStatus = "planned" | "active" | "completed"

export type SprintData = {
  id: string
  name: string
  goal: string | null
  status: SprintStatus
  startDate: string
  endDate: string
  pointsTarget: number | null
  projectId: string | null
  createdAt: string
}

export type SprintDetail = SprintData & {
  createdBy: { id: string; name: string; avatarUrl: string | null } | null
  project: { id: string; name: string; color: string | null } | null
  tickets: Array<{
    id: string
    title: string
    ticketNumber: number
    status: string
    priority: string
    storyPoints: number | null
    isDone: boolean
    subDepartment: { prefix: string }
    assignee: { id: string; name: string; avatarUrl: string | null } | null
  }>
  _count: { tickets: number }
}

export type ProjectTicket = {
  id: string
  title: string
  ticketNumber: number
  status: string
  sprintId: string | null
  subDepartment: { prefix: string }
}

export type CreateSprintBody = {
  name: string
  goal?: string | null
  startDate: string
  endDate: string
  pointsTarget?: number | null
  projectId?: string | null
  ticketIds?: string[]
}

export type UpdateSprintBody = {
  name?: string
  goal?: string | null
  startDate?: string
  endDate?: string
  pointsTarget?: number | null
  projectId?: string | null
  ticketIds?: string[]
}

export type SprintListItem = SprintData & {
  tickets: Array<{ status: string; storyPoints: number | null; isDone: boolean }>
  project: { id: string; name: string; color: string | null } | null
}

export async function getSprints(projectId?: string): Promise<SprintListItem[]> {
  const url = projectId
    ? `/api/sprints?projectId=${encodeURIComponent(projectId)}`
    : "/api/sprints"
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch sprints")
  return res.json()
}

export async function getProjectTickets(projectId: string): Promise<ProjectTicket[]> {
  const res = await fetch(`/api/tickets?projectId=${encodeURIComponent(projectId)}`)
  if (!res.ok) throw new Error("Failed to fetch project tickets")
  return res.json()
}

export async function getSprintDetail(id: string): Promise<SprintDetail> {
  const res = await fetch(`/api/sprints/${id}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to fetch sprint")
  }
  return res.json()
}

export type ImportResult = {
  created: number
  skipped: number
  errors: { row: number; message: string }[]
}

export async function createSprint(body: CreateSprintBody): Promise<SprintData> {
  return apiFetch<SprintData>("/api/sprints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    fallbackError: "Failed to create sprint",
  })
}

export async function updateSprint(id: string, body: UpdateSprintBody): Promise<SprintData> {
  return apiFetch<SprintData>(`/api/sprints/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    fallbackError: "Failed to update sprint",
  })
}

export async function deleteSprint(id: string): Promise<void> {
  await apiFetch<void>(`/api/sprints/${id}`, {
    method: "DELETE",
    fallbackError: "Failed to delete sprint",
  })
}

export async function updateSprintStatus(
  id: string,
  status: SprintStatus,
): Promise<SprintData> {
  return apiFetch<SprintData>(`/api/sprints/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
    fallbackError: "Failed to update sprint status",
  })
}

export async function importSprintsCSV(file: File, projectId?: string | null): Promise<ImportResult> {
  const formData = new FormData()
  formData.append("file", file)
  if (projectId) formData.append("projectId", projectId)
  const res = await fetch("/api/sprints/import", {
    method: "POST",
    body: formData,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to import sprints")
  }
  return res.json()
}

export function downloadSprintTemplate(): void {
  const a = document.createElement("a")
  a.href = "/api/sprints/template"
  a.download = "sprint-import-template.csv"
  a.click()
}
