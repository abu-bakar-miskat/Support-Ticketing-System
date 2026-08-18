export type SubDepartmentMember = {
  id: string
  name: string
  avatarUrl?: string | null
  departmentName?: string | null
  subDepartmentName?: string | null
  role?: string
}

export type SubDepartmentStatus = {
  id: string
  label: string
  color: string
  order: number
  isComplete: boolean
  allowedLabels: string[]
}

export async function getSubDepartmentMembers(subDepartmentId: string): Promise<SubDepartmentMember[]> {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/members`)
  if (!res.ok) throw new Error("Failed to fetch team members")
  return res.json()
}

export async function getSubDepartmentStatuses(subDepartmentId: string): Promise<SubDepartmentStatus[]> {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/statuses`)
  if (!res.ok) throw new Error("Failed to fetch team statuses")
  return res.json()
}

export async function createSubDepartmentStatus(
  subDepartmentId: string,
  body: { label: string; color: string; order?: number; allowedLabels?: string[] },
) {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create status")
  return res.json()
}

export async function updateSubDepartmentStatus(
  subDepartmentId: string,
  statusId: string,
  body: { label?: string; color?: string; order?: number; isComplete?: boolean; allowedLabels?: string[] },
) {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/statuses/${statusId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update status")
  return res.json()
}

export async function deleteSubDepartmentStatus(subDepartmentId: string, statusId: string) {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/statuses/${statusId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to delete status")
}

export async function handleJoinRequest(
  subDepartmentId: string,
  requestId: string,
  body: { action: "approve" | "reject"; role?: string; nickname?: string | null; isActive?: boolean; crossAccess?: boolean },
) {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/join-requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to handle join request")
  return res.json()
}

export async function reorderSubDepartmentStatuses(
  subDepartmentId: string,
  statuses: { id: string; order: number }[],
) {
  const order = statuses.map((s) => s.id)
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/statuses`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  })
  if (!res.ok) throw new Error("Failed to reorder statuses")
}

export type SubDepartmentGitHubMap = {
  onPrOpened: string | null
  onPrReadyForReview: string | null
  onPrMerged: string | null
}

export type SubDepartmentGitHubMapResponse = {
  config: SubDepartmentGitHubMap | null
  defaults: { prOpened: string | null; prReadyForReview: string | null; prMerged: string | null }
}

export async function getSubDepartmentGitHubMap(subDepartmentId: string): Promise<SubDepartmentGitHubMapResponse> {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/github-map`)
  if (!res.ok) throw new Error("Failed to fetch GitHub status map")
  return res.json()
}

export async function updateSubDepartmentGitHubMap(
  subDepartmentId: string,
  body: Partial<SubDepartmentGitHubMap>,
): Promise<SubDepartmentGitHubMap> {
  const res = await fetch(`/api/sub-departments/${subDepartmentId}/github-map`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update GitHub status map")
  return res.json()
}
