export type TeamMember = {
  id: string
  name: string
  avatarUrl?: string | null
  departmentName?: string | null
  teamName?: string | null
  role?: string
}

export type TeamStatus = {
  id: string
  label: string
  color: string
  order: number
  isComplete: boolean
  allowedLabels: string[]
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const res = await fetch(`/api/teams/${teamId}/members`)
  if (!res.ok) throw new Error("Failed to fetch team members")
  return res.json()
}

export async function getTeamStatuses(teamId: string): Promise<TeamStatus[]> {
  const res = await fetch(`/api/teams/${teamId}/statuses`)
  if (!res.ok) throw new Error("Failed to fetch team statuses")
  return res.json()
}

export async function createTeamStatus(
  teamId: string,
  body: { label: string; color: string; order?: number; allowedLabels?: string[] },
) {
  const res = await fetch(`/api/teams/${teamId}/statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create status")
  return res.json()
}

export async function updateTeamStatus(
  teamId: string,
  statusId: string,
  body: { label?: string; color?: string; order?: number; isComplete?: boolean; allowedLabels?: string[] },
) {
  const res = await fetch(`/api/teams/${teamId}/statuses/${statusId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update status")
  return res.json()
}

export async function deleteTeamStatus(teamId: string, statusId: string) {
  const res = await fetch(`/api/teams/${teamId}/statuses/${statusId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to delete status")
}

export async function handleJoinRequest(
  teamId: string,
  requestId: string,
  body: { action: "approve" | "reject"; role?: string; nickname?: string | null; isActive?: boolean; crossAccess?: boolean },
) {
  const res = await fetch(`/api/teams/${teamId}/join-requests/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to handle join request")
  return res.json()
}

export async function reorderTeamStatuses(
  teamId: string,
  statuses: { id: string; order: number }[],
) {
  const order = statuses.map((s) => s.id)
  const res = await fetch(`/api/teams/${teamId}/statuses`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  })
  if (!res.ok) throw new Error("Failed to reorder statuses")
}

export type TeamGitHubMap = {
  onPrOpened: string | null
  onPrReadyForReview: string | null
  onPrMerged: string | null
}

export type TeamGitHubMapResponse = {
  config: TeamGitHubMap | null
  defaults: { prOpened: string | null; prReadyForReview: string | null; prMerged: string | null }
}

export async function getTeamGitHubMap(teamId: string): Promise<TeamGitHubMapResponse> {
  const res = await fetch(`/api/teams/${teamId}/github-map`)
  if (!res.ok) throw new Error("Failed to fetch GitHub status map")
  return res.json()
}

export async function updateTeamGitHubMap(
  teamId: string,
  body: Partial<TeamGitHubMap>,
): Promise<TeamGitHubMap> {
  const res = await fetch(`/api/teams/${teamId}/github-map`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update GitHub status map")
  return res.json()
}
