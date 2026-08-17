import type { BoardCardData, TeamStatusConfig } from "@/components/board/board-types"

export type ProjectAsset = {
  id: string
  name: string
  type: "folder" | "image" | "pdf" | "document" | "video" | "markdown" | "link"
  parentId: string | null
  url?: string
  content?: string
  mimeType?: string
  createdAt: string
}

export type AnalyticalLink = {
  id: string
  name: string
  url: string
}

export type TicketRow = {
  id: string
  humanId: string
  title: string
  status: string
  priority: string
  type: string
  assigneeName: string | null
  assigneeColor: string | null
  assigneeAvatarUrl?: string | null
  creatorName: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
  commentCount: number
  labels: string[]
  teamName: string
  lastMessageDirection: "inbound" | "outbound" | null
}

export type ActivityItem = {
  id: string
  actorName: string
  actorAvatarUrl?: string | null
  action: string
  metadata: Record<string, unknown>
  createdAt: string
  ticketId: string
  ticketTitle: string
  ticketHumanId: string
}

export type ProjectMember = {
  name: string
  initials: string
  bg: string
}

export type BoardTeamSource = "department" | "member"

export type AddableBoardTeam = {
  id: string
  name: string
  source: BoardTeamSource
  memberNames: string[]
  statuses: TeamStatusConfig[]
}

export type ProjectTeamBoardGroup = {
  teamId: string
  teamName: string
  cards: BoardCardData[]
  members: ProjectMember[]
  statuses: TeamStatusConfig[]
  teamMembersForCreate: {
    id: string
    name: string
    avatarUrl?: string | null
    departmentName?: string | null
    teamName?: string | null
  }[]
  boardSource: BoardTeamSource | "tickets"
  memberNames: string[]
}

export type ProjectDetailsResponse = {
  project: {
    id: string
    name: string
    slug: string
    kind: string
    color: string
    avatarUrl?: string | null
    description: string | null
    teamName: string | null
    teamId?: string | null
    projectStatus: string | null
    pipelineStartedAt: string | null
    developmentStartedAt: string | null
    liveAt: string | null
    lifecycleStages: import("@/lib/project-lifecycle").LifecycleStage[]
    departmentId: string | null
    departmentName: string | null
    moduleSystemEnabled: boolean
    modules: { id: string; name: string; status: string }[]
    githubRepo: string | null
    projectUrl: string | null
    analyticalLinks: AnalyticalLink[]
    guidelines: string | null
    assets: ProjectAsset[]
    createdAt: string
  }
  canEdit: boolean
  canManageLifecycle: boolean
  canManageProjectSettings: boolean
  canManageBoards: boolean
  canModifyProject: boolean
  canAddAssets: boolean
  canDeleteAssets: boolean
  defaultTab: string | null
  stats: {
    total: number
    open: number
    closed: number
    inProgress: number
    byPriority: Record<string, number>
  }
  timeStats: {
    totalSecs: number
    byUser: { userId: string; userName: string; avatarUrl: string | null; totalSecs: number }[]
  }
  qaTimeStats: {
    totalSecs: number
    byUser: { userId: string; userName: string; avatarUrl: string | null; totalSecs: number }[]
  }
  members: ProjectMember[]
  statusDist: { label: string; color: string; count: number }[]
  tickets: TicketRow[]
  boardStatuses: TeamStatusConfig[]
  teamBoardGroups: ProjectTeamBoardGroup[]
  recentActivity: ActivityItem[]
  allProjectAssignees: {
    id: string
    name: string
    avatarUrl: string | null
    departmentName: string | null
    teamName: string | null
  }[]
  projectMemberUsers: {
    id: string
    name: string
    avatarUrl: string | null
    departmentName: string | null
    teamName: string | null
  }[]
  currentUserIsProjectMember: boolean
  canSelfJoinProject: boolean
  mainTeamId: string | null
  enabledBoardTeamIds: string[]
  addableBoardTeams: AddableBoardTeam[]
}

export async function updateProjectBoards(
  projectId: string,
  body: { action: "add" | "remove"; teamId: string },
): Promise<{ enabledBoardTeamIds: string[] }> {
  const res = await fetch(`/api/projects/${projectId}/boards`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? "Failed to update boards");
  }
  return res.json();
}

export async function getProjectDetails(idOrSlug: string): Promise<ProjectDetailsResponse> {
  const res = await fetch(`/api/projects/${idOrSlug}`)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? "Failed to fetch project")
  }
  return res.json()
}

export async function fetchDepartmentPeople(departmentId: string): Promise<
  {
    id: string
    name: string
    avatarUrl: string | null
    role: string
    departmentName: string | null
    teamName: string | null
  }[]
> {
  const res = await fetch(`/api/departments/${departmentId}/people`)
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? "Failed to fetch department people")
  }
  const data = await res.json()
  return data.people ?? []
}

export async function updateProjectAssets(
  projectId: string,
  assets: ProjectAsset[],
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/assets`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? "Failed to update assets")
  }
}
