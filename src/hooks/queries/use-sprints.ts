"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createSprint,
  deleteSprint,
  getProjectTickets,
  getSprints,
  getSprintDetail,
  importSprintsCSV,
  updateSprint,
  updateSprintStatus,
} from "@/lib/api/sprints"
import type { CreateSprintBody, ImportResult, SprintListItem, SprintStatus, UpdateSprintBody } from "@/lib/api/sprints"
import { sprintKeys, ticketKeys } from "./keys"

export function useSprints(projectId?: string) {
  return useQuery<SprintListItem[]>({
    queryKey: projectId ? sprintKeys.byProject(projectId) : sprintKeys.all,
    queryFn: () => getSprints(projectId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useSprintDetail(id: string | null) {
  return useQuery({
    queryKey: sprintKeys.detail(id ?? ""),
    queryFn: () => getSprintDetail(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useProjectTickets(projectId: string) {
  return useQuery({
    queryKey: ticketKeys.byProject(projectId),
    queryFn: () => getProjectTickets(projectId),
    enabled: !!projectId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateSprint(opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSprintBody) => createSprint(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.all })
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useUpdateSprint(
  id: string,
  opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateSprintBody) => updateSprint(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sprintKeys.all })
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useDeleteSprint(opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSprint(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: sprintKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sprintKeys.all })
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useUpdateSprintStatus(opts?: {
  onSuccess?: () => void
  onError?: (err: Error) => void
}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SprintStatus }) =>
      updateSprintStatus(id, status),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: sprintKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sprintKeys.all })
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useImportSprints(opts?: {
  onSuccess?: (result: ImportResult) => void
  onError?: (err: Error) => void
}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId?: string | null }) =>
      importSprintsCSV(file, projectId),
    onSuccess: (result) => {
      if (result.created > 0) {
        queryClient.invalidateQueries({ queryKey: sprintKeys.all })
      }
      opts?.onSuccess?.(result)
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}
