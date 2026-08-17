"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getTeamMembers } from "@/lib/api/teams"
import { moveTicket, type MoveTicketBody } from "@/lib/api/tickets"
import { ticketKeys, teamKeys } from "./keys"

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: teamKeys.members(teamId),
    queryFn: () => getTeamMembers(teamId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: !!teamId,
  })
}

export function useMoveTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: MoveTicketBody }) =>
      moveTicket(ticketId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
    },
  })
}
