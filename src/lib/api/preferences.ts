export type UserPreferences = {
  pinnedProjectIds?: string[]
  projectTabPrefs?: Record<string, string>
  fontSize?: string
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences")
  if (!res.ok) throw new Error("Failed to fetch preferences")
  return res.json()
}

export async function updateProjectTabPref(projectId: string, tab: string): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectTabPref: { projectId, tab } }),
  })
  if (!res.ok) throw new Error("Failed to save tab preference")
  return res.json()
}

export async function updatePinnedProjects(pinnedProjectIds: string[]): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinnedProjectIds }),
  })
  if (!res.ok) throw new Error("Failed to update pinned projects")
  return res.json()
}

export async function updateFontSize(fontSize: string): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fontSize }),
  })
  if (!res.ok) throw new Error("Failed to save font size")
  return res.json()
}
