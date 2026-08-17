export async function getNotification(id: string) {
  const res = await fetch(`/api/notifications/${id}`)
  if (!res.ok) throw new Error("Failed to fetch notification")
  return res.json()
}

export async function markNotificationRead(id: string) {
  const res = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error("Failed to mark notification as read")
}

export async function markAllNotificationsRead() {
  const res = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  })
  if (!res.ok) throw new Error("Failed to mark all notifications as read")
}
