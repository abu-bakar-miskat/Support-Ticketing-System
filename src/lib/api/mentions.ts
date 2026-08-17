export type MentionItem = {
  id: string
  author: string
  initials: string
  avatarColor: string
  avatarUrl?: string | null
  role: string
  ticketId: string
  ticketDbId: string
  ticketTitle: string
  body: string
  time: string
  unread: boolean
  section: "today" | "earlier"
}

export async function fetchMentions(): Promise<MentionItem[]> {
  const res = await fetch("/api/mentions")
  if (!res.ok) throw new Error("Failed to fetch mentions")
  const data = await res.json()
  return data.mentions
}

export async function markMentionRead(id: string): Promise<void> {
  const res = await fetch("/api/mentions/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error("Failed to mark mention as read")
}

export async function markAllMentionsRead(): Promise<void> {
  const res = await fetch("/api/mentions/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  })
  if (!res.ok) throw new Error("Failed to mark all mentions as read")
}
