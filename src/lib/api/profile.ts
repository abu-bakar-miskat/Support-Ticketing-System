export type SignatureEntryBody = {
  id?: string
  label: string
  html: string
}

export type SignatureBody = {
  enabled: boolean
  activeId: string | null
  list: SignatureEntryBody[]
}

export type UpdateProfileBody = {
  name?: string
  avatarUrl?: string
  bio?: string
  location?: string | null
  timezone?: string
  githubUsername?: string | null
  signature?: SignatureBody
}

export type NotificationPrefs = {
  emailOnAssign?: boolean
  emailOnMention?: boolean
  emailOnTicketComplete?: boolean
  emailOnComment?: boolean
}

export async function updateProfile(body: UpdateProfileBody) {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update profile")
  return res.json()
}

export async function updateNotificationPrefs(body: NotificationPrefs) {
  const res = await fetch("/api/profile/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Failed to update notification preferences")
}
