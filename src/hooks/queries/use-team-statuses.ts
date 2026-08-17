"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getTeamStatuses,
  createTeamStatus,
  updateTeamStatus,
  deleteTeamStatus,
  reorderTeamStatuses,
} from "@/lib/api/teams"
import { teamKeys } from "./keys"

export function useTeamStatuses(teamId: string) {
  return useQuery({
    queryKey: teamKeys.statuses(teamId),
    queryFn: () => getTeamStatuses(teamId),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateTeamStatus(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { label: string; color: string; order?: number }) =>
      createTeamStatus(teamId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.statuses(teamId) })
    },
  })
}

export function useUpdateTeamStatus(teamId: string) {
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
    }) => updateTeamStatus(teamId, statusId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.statuses(teamId) })
    },
  })
}

export function useDeleteTeamStatus(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (statusId: string) => deleteTeamStatus(teamId, statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.statuses(teamId) })
    },
  })
}

export function useReorderTeamStatuses(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (statuses: { id: string; order: number }[]) =>
      reorderTeamStatuses(teamId, statuses),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.statuses(teamId) })
    },
  })
}
