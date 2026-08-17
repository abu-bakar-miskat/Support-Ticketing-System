import { useQuery } from "@tanstack/react-query"
import { labelKeys } from "./keys"

export type LabelOption = { id: string; name: string; color: string }

async function fetchLabels(): Promise<LabelOption[]> {
  const res = await fetch("/api/labels")
  if (!res.ok) throw new Error("Failed to fetch labels")
  const data = await res.json()
  const labels = data.labels ?? data
  return Array.isArray(labels) ? labels : []
}

export function useLabels() {
  return useQuery({
    queryKey: labelKeys.all,
    queryFn: fetchLabels,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
