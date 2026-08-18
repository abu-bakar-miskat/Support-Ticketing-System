"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getSubDepartmentMembers } from "@/lib/api/sub-departments"
import { moveTicket, type MoveTicketBody } from "@/lib/api/tickets"
import { ticketKeys, subDepartmentKeys } from "./keys"

export function useSubDepartmentMembers(subDepartmentId: string) {
  return useQuery({
    queryKey: subDepartmentKeys.members(subDepartmentId),
    queryFn: () => getSubDepartmentMembers(subDepartmentId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: !!subDepartmentId,
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
