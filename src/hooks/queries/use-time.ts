"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTimeEntries, startTimer, stopTimer } from "@/lib/api/time"
import { timeKeys } from "./keys"

export function useTimeEntries() {
  return useQuery({
    queryKey: timeKeys.entries(),
    queryFn: fetchTimeEntries,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useStartTimer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ticketId?: string) => startTimer(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timeKeys.entries() })
    },
  })
}

export function useStopTimer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId?: string) => stopTimer(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: timeKeys.entries() })
    },
  })
}
