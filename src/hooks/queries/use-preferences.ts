"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateProjectTabPref, updatePinnedProjects } from "@/lib/api/preferences"

export const preferencesKeys = {
  all: ["user", "preferences"] as const,
}

export function useSaveProjectTabPref() {
  return useMutation({
    mutationFn: ({ projectId, tab }: { projectId: string; tab: string }) =>
      updateProjectTabPref(projectId, tab),
  })
}

export function useUpdatePinnedProjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pinnedProjectIds: string[]) => updatePinnedProjects(pinnedProjectIds),
    onSuccess: (saved) => {
      const ids = saved.pinnedProjectIds ?? []
      queryClient.setQueryData(preferencesKeys.all, saved)
      queryClient.setQueryData(["dashboard", "layout"], (old: unknown) => {
        if (!old || typeof old !== "object" || Array.isArray(old)) return old
        return { ...(old as Record<string, unknown>), pinnedProjectIds: ids }
      })
    },
  })
}
