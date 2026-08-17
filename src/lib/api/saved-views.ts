import type { SavedView, SavedViewFilters } from "@/app/api/saved-views/route"

export type { SavedView, SavedViewFilters }

export async function fetchSavedViews(): Promise<SavedView[]> {
  const res = await fetch("/api/saved-views")
  if (!res.ok) throw new Error("Failed to load saved views")
  const data = await res.json()
  return data.views ?? []
}

export async function createSavedView(
  name: string,
  filters: SavedViewFilters,
): Promise<SavedView[]> {
  const res = await fetch("/api/saved-views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filters }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save view")
  return (await res.json()).views ?? []
}

export async function deleteSavedView(id: string): Promise<SavedView[]> {
  const res = await fetch(`/api/saved-views?id=${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete view")
  return (await res.json()).views ?? []
}
