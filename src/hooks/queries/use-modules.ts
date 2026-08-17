"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createModule,
  deleteModule,
  getModuleRollup,
  getProjectModules,
  updateModule,
  updateModuleStatus,
} from "@/lib/api/modules"
import type { ModuleListResponse, ModuleRollupResponse, ModuleStatus } from "@/lib/api/modules"
import { moduleKeys } from "./keys"

export function useProjectModules(projectId: string | null) {
  return useQuery<ModuleListResponse>({
    queryKey: moduleKeys.byProject(projectId ?? ""),
    queryFn: () => getProjectModules(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useModuleRollup(projectId: string | null) {
  return useQuery<ModuleRollupResponse>({
    queryKey: moduleKeys.rollup(projectId ?? ""),
    queryFn: () => getModuleRollup(projectId!),
    enabled: !!projectId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

function useInvalidateProjectModules() {
  const queryClient = useQueryClient()
  return (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: moduleKeys.byProject(projectId) })
    void queryClient.invalidateQueries({ queryKey: moduleKeys.rollup(projectId) })
  }
}

export function useCreateModule(opts?: {
  onSuccess?: (data: unknown, vars: { projectId: string; name: string; description?: string | null }) => void
  onError?: (err: Error) => void
}) {
  const invalidate = useInvalidateProjectModules()
  return useMutation({
    mutationFn: ({ projectId, name, description }: { projectId: string; name: string; description?: string | null }) =>
      createModule(projectId, { name, description }),
    onSuccess: (data, vars) => {
      invalidate(vars.projectId)
      opts?.onSuccess?.(data, vars)
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useUpdateModule(opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const invalidate = useInvalidateProjectModules()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; projectId: string; body: { name?: string; description?: string | null; order?: number } }) =>
      updateModule(id, body),
    onSuccess: (_data, { projectId }) => {
      invalidate(projectId)
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useDeleteModule(opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const invalidate = useInvalidateProjectModules()
  return useMutation({
    mutationFn: ({ id }: { id: string; projectId: string }) => deleteModule(id),
    onSuccess: (_data, { projectId }) => {
      invalidate(projectId)
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}

export function useUpdateModuleStatus(opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const invalidate = useInvalidateProjectModules()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; projectId: string; status: ModuleStatus }) =>
      updateModuleStatus(id, status),
    onSuccess: (_data, { projectId }) => {
      invalidate(projectId)
      opts?.onSuccess?.()
    },
    onError: (err: Error) => opts?.onError?.(err),
  })
}
