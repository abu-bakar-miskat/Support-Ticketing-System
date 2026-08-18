"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getSubDepartmentStatuses,
  createSubDepartmentStatus,
  updateSubDepartmentStatus,
  deleteSubDepartmentStatus,
  reorderSubDepartmentStatuses,
} from "@/lib/api/sub-departments"
import { subDepartmentKeys } from "./keys"

export function useSubDepartmentStatuses(subDepartmentId: string) {
  return useQuery({
    queryKey: subDepartmentKeys.statuses(subDepartmentId),
    queryFn: () => getSubDepartmentStatuses(subDepartmentId),
    enabled: !!subDepartmentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateSubDepartmentStatus(subDepartmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { label: string; color: string; order?: number }) =>
      createSubDepartmentStatus(subDepartmentId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subDepartmentKeys.statuses(subDepartmentId) })
    },
  })
}

export function useUpdateSubDepartmentStatus(subDepartmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      statusId,
      body,
    }: {
      statusId: string
      body: {
        label?: string
        color?: string
        order?: number
        isComplete?: boolean
        allowedLabels?: string[]
      }
    }) => updateSubDepartmentStatus(subDepartmentId, statusId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subDepartmentKeys.statuses(subDepartmentId) })
    },
  })
}

export function useDeleteSubDepartmentStatus(subDepartmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (statusId: string) => deleteSubDepartmentStatus(subDepartmentId, statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subDepartmentKeys.statuses(subDepartmentId) })
    },
  })
}

export function useReorderSubDepartmentStatuses(subDepartmentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (statuses: { id: string; order: number }[]) =>
      reorderSubDepartmentStatuses(subDepartmentId, statuses),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subDepartmentKeys.statuses(subDepartmentId) })
    },
  })
}
