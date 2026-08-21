import { readJsonResponse } from "@/lib/api/response"

export type AdminProject = {
  id: string
  name: string
  color: string | null
  slug: string
  description: string | null
  subDepartmentId: string | null
  _count?: { tickets: number }
}

export type AdminUser = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  subDepartmentId: string | null
  subDepartment: { id: string; name: string } | null
}

export type AdminSubDepartment = {
  id: string
  name: string
  prefix: string
  departmentId: string | null
}

export type AdminDepartment = {
  id: string
  name: string
  slug: string
}

export async function getAdminProjects(): Promise<AdminProject[]> {
  const res = await fetch("/api/admin/projects")
  if (!res.ok) throw new Error("Failed to fetch projects")
  return res.json()
}

export async function createAdminProject(body: {
  name: string
  color?: string
  description?: string | null
  projectStatus?: string
  lifecycleStages?: import("@/lib/project-lifecycle").LifecycleStage[]
  moduleSystemEnabled?: boolean
  liveDomain?: string | null
  departmentId?: string | null
  memberIds?: string[]
}) {
  const { liveDomain, ...rest } = body
  const res = await fetch("/api/admin/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, projectUrl: liveDomain }),
  })
  return readJsonResponse<{ id: string }>(res)
}

export async function uploadAdminProjectAvatar(projectId: string, file: File) {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch(`/api/admin/projects/${projectId}/avatar`, {
    method: "POST",
    body: fd,
  })
  return readJsonResponse<{ avatarUrl: string }>(res)
}

export async function updateAdminProject(
  id: string,
  body: {
    name?: string
    color?: string
    description?: string | null
    projectStatus?: string
    pipelineStartedAt?: string | null
    developmentStartedAt?: string | null
    liveAt?: string | null
    lifecycleStages?: import("@/lib/project-lifecycle").LifecycleStage[]
    moduleSystemEnabled?: boolean
    liveDomain?: string | null
    departmentId?: string | null
    memberIds?: string[]
  },
) {
  const { liveDomain, ...rest } = body
  const res = await fetch(`/api/admin/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, projectUrl: liveDomain }),
  })
  return readJsonResponse(res)
}

export async function deleteAdminProject(id: string) {
  const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete project")
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users")
  if (!res.ok) throw new Error("Failed to fetch users")
  return res.json()
}

export async function updateAdminUser(
  id: string,
  body: { role?: string; subDepartmentId?: string },
) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update user")
  return res.json()
}

export async function deleteAdminUser(id: string) {
  const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete user")
}

export async function getAdminSubDepartments(): Promise<AdminSubDepartment[]> {
  const res = await fetch("/api/admin/sub-departments")
  if (!res.ok) throw new Error("Failed to fetch teams")
  return res.json()
}

export async function createAdminSubDepartment(body: {
  name: string
  prefix?: string
  color?: string
  departmentId?: string
}) {
  const res = await fetch("/api/admin/sub-departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? "Failed to create team")
  }
  return res.json()
}

export async function updateAdminSubDepartment(
  id: string,
  body: { name?: string; prefix?: string; color?: string; departmentId?: string },
) {
  const res = await fetch(`/api/admin/sub-departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? "Failed to update team")
  }
  return res.json()
}

export async function deleteAdminSubDepartment(id: string) {
  const res = await fetch(`/api/admin/sub-departments/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? "Failed to delete team")
  }
}

export async function getAdminSubDepartmentMembers(
  subDepartmentId: string,
): Promise<AdminUser[]> {
  const res = await fetch(`/api/admin/sub-departments/${subDepartmentId}/members`)
  if (!res.ok) throw new Error("Failed to fetch team members")
  return res.json()
}

export async function addAdminSubDepartmentMember(subDepartmentId: string, userId: string, role?: string) {
  const res = await fetch(`/api/admin/sub-departments/${subDepartmentId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...(role ? { role } : {}) }),
  })
  if (!res.ok) throw new Error("Failed to add team member")
}

export async function removeAdminSubDepartmentMember(subDepartmentId: string, userId: string) {
  const res = await fetch(`/api/admin/sub-departments/${subDepartmentId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error("Failed to remove team member")
}

export async function updateAdminSubDepartmentMemberRole(subDepartmentId: string, userId: string, role: string) {
  const res = await fetch(`/api/admin/sub-departments/${subDepartmentId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  })
  if (!res.ok) throw new Error("Failed to update member role")
}

export async function removeAdminDeptMember(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error("Failed to remove department member")
}

export async function getAdminDepartments(): Promise<AdminDepartment[]> {
  const res = await fetch("/api/admin/departments")
  if (!res.ok) throw new Error("Failed to fetch departments")
  return res.json()
}

export async function createAdminDepartment(body: { name: string; type?: string }) {
  const res = await fetch("/api/admin/departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to create department")
  return res.json()
}

export async function updateAdminDepartment(id: string, body: { name?: string; isHub?: boolean }) {
  const res = await fetch(`/api/admin/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update department")
  return res.json()
}

export async function deleteAdminDepartment(id: string) {
  const res = await fetch(`/api/admin/departments/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete department")
}

export async function assignDepartmentManager(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/managers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error("Failed to assign manager")
  return res.json()
}

export async function removeDepartmentManager(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/managers/${userId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to remove manager")
}

export async function grantDepartmentAccess(
  deptId: string,
  body: {
    userId: string
    expiresAt?: string
    reason?: string
    fullAccess?: boolean
    projectIds?: string[]
  },
) {
  const res = await fetch(`/api/admin/departments/${deptId}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to grant access")
  return res.json()
}

export async function revokeDepartmentAccess(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/access/${userId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to revoke access")
}

export async function fetchDepartmentAccessGrant(
  deptId: string,
  userId: string,
): Promise<{ fullAccess: boolean; expiresAt: string | null; reason: string | null; projectIds: string[] }> {
  const res = await fetch(`/api/admin/departments/${deptId}/access/${userId}`)
  if (!res.ok) throw new Error("Failed to fetch access grant")
  return res.json()
}

export async function updateDepartmentAccess(
  deptId: string,
  userId: string,
  body: { expiresAt?: string; reason?: string; fullAccess?: boolean; projectIds?: string[] },
) {
  const res = await fetch(`/api/admin/departments/${deptId}/access/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update access")
  return res.json()
}

export async function fetchDepartmentProjects(deptId: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`/api/admin/departments/${deptId}/projects`)
  if (!res.ok) throw new Error("Failed to fetch department projects")
  return res.json()
}

export async function addDepartmentMember(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/direct-members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error("Failed to add member")
  return res.json()
}

export async function removeDepartmentDirectMember(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/direct-members/${userId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to remove member")
}

export type DepartmentInviteRow = {
  id: string
  email: string
  role: string
  message: string | null
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  subDepartment: { id: string; name: string }
  inviter: { id: string; name: string }
}

export async function fetchDepartmentInvites(deptId: string): Promise<DepartmentInviteRow[]> {
  const res = await fetch(`/api/admin/departments/${deptId}/invites`)
  if (!res.ok) throw new Error("Failed to fetch invites")
  return res.json()
}

export async function createDepartmentInvite(
  deptId: string,
  body: { email: string; subDepartmentId: string; role: string; message?: string },
): Promise<DepartmentInviteRow> {
  const res = await fetch(`/api/admin/departments/${deptId}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.error === "string" ? data.error : "Failed to send invite")
  }
  return res.json()
}

export async function revokeDepartmentInvite(deptId: string, inviteId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/invites/${inviteId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to revoke invite")
}

// Removes a native member: deletes their TeamMembership rows for this department's teams.
export async function removeDepartmentMember(deptId: string, userId: string) {
  const res = await fetch(`/api/admin/departments/${deptId}/members`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error("Failed to remove member")
}

export async function bulkAssignTickets(ticketIds: string[], assigneeId: string): Promise<{ updated: number }> {
  const res = await fetch("/api/admin/tickets/bulk-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketIds, assigneeId }),
  })
  if (!res.ok) throw new Error("Failed to bulk assign tickets")
  return res.json()
}

export async function smartAssignTickets(
  ticketIds: string[],
  mode: "single" | "round-robin",
  assigneeIds: string[],
): Promise<{ updated: number }> {
  const res = await fetch("/api/admin/tickets/smart-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketIds, mode, assigneeIds }),
  })
  if (!res.ok) throw new Error("Failed to assign tickets")
  return res.json()
}

export async function handleDepartmentJoinRequest(
  departmentId: string,
  requestId: string,
  body: {
    action: "approve" | "reject"
    subDepartmentId?: string
    role?: string
    nickname?: string | null
    fullAccess?: boolean
    projectIds?: string[]
    expiresAt?: string
    reason?: string
  },
) {
  const res = await fetch(
    `/api/departments/${departmentId}/join-requests/${requestId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error("Failed to handle join request")
  return res.json()
}
