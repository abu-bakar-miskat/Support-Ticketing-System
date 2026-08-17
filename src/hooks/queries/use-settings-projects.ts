"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAdminProjects,
  createAdminProject,
  updateAdminProject,
  deleteAdminProject,
} from "@/lib/api/admin"

export const settingsProjectKeys = {
  all: ["admin", "projects"] as const,
}

export function useSettingsProjects() {
  return useQuery({
    queryKey: settingsProjectKeys.all,
    queryFn: getAdminProjects,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAdminProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsProjectKeys.all })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateAdminProject>[1] }) =>
      updateAdminProject(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsProjectKeys.all })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAdminProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsProjectKeys.all })
    },
  })
}
