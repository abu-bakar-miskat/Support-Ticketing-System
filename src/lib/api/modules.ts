export type ModuleStatus = "planned" | "in_progress" | "completed"

export type ModuleData = {
  id: string
  name: string
  description: string | null
  status: ModuleStatus
  order: number
  projectId: string
  createdAt: string
  updatedAt: string
}

export type ModuleListItem = {
  id: string
  name: string
  description: string | null
  status: ModuleStatus
  order: number
}

export type ModuleListResponse = {
  moduleSystemEnabled: boolean
  modules: ModuleListItem[]
}

export type ModuleTicket = {
  id: string
  title: string
  ticketNumber: number
  status: string
  priority: string
  type: string
  labels: string[]
  storyPoints: number | null
  parentId: string | null
  createdAt: string
  closedAt: string | null
  isDone: boolean
  team: { prefix: string }
  assignee: { id: string; name: string; avatarUrl: string | null } | null
}

export type ModuleRollup = ModuleData & {
  createdBy: { id: string; name: string; avatarUrl: string | null } | null
  tickets: ModuleTicket[]
}

/** Workflow column from any team on the project (merged unique labels). */
export type ModuleWorkflowStatus = {
  label: string
  color: string
}

export type ModuleRollupResponse = {
  project: { id: string; name: string; moduleSystemEnabled: boolean }
  /** Merged team workflow statuses for this project — use exact labels, not canonical buckets. */
  statuses: ModuleWorkflowStatus[]
  modules: ModuleRollup[]
  moduleZero: { tickets: ModuleTicket[] }
}

export async function getProjectModules(projectId: string): Promise<ModuleListResponse> {
  const res = await fetch(`/api/projects/${projectId}/modules`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to fetch modules")
  }
  return res.json()
}

export async function getModuleRollup(projectId: string): Promise<ModuleRollupResponse> {
  const res = await fetch(`/api/projects/${projectId}/modules/rollup`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to fetch module rollup")
  }
  return res.json()
}

export async function createModule(
  projectId: string,
  body: { name: string; description?: string | null },
): Promise<ModuleData> {
  const res = await fetch(`/api/projects/${projectId}/modules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to create module")
  }
  return res.json()
}

export async function updateModule(
  id: string,
  body: { name?: string; description?: string | null; order?: number },
): Promise<ModuleData> {
  const res = await fetch(`/api/modules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to update module")
  }
  return res.json()
}

export async function deleteModule(id: string): Promise<void> {
  const res = await fetch(`/api/modules/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to delete module")
  }
}

export async function updateModuleStatus(
  id: string,
  status: ModuleStatus,
): Promise<ModuleData> {
  const res = await fetch(`/api/modules/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Failed to update module status")
  }
  return res.json()
}
