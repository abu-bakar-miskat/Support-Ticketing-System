"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getTicketDetail,
  updateTicket,
  deleteTicket,
  createTicket,
  addComment,
  updateTicketAssignee,
  addCoAssignee,
  removeCoAssignee,
  type UpdateTicketBody,
  type CreateTicketBody,
  type AddCommentBody,
  type TicketDetailProps,
} from "@/lib/api/tickets"
import { buildTicketDetailPlaceholder } from "@/lib/ticket-detail-placeholder"
import type { BoardCardData } from "@/components/board/board-types"
import type { AllTasksResponse, MyTasksResponse, TasksMetaResponse } from "@/lib/api/tasks"
import { ticketKeys, taskKeys } from "./keys"
import { invalidateTaskCaches } from "./invalidate-task-caches"

function findTaskCardInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): BoardCardData | undefined {
  const my = queryClient.getQueryData<MyTasksResponse>(taskKeys.my())

  // Also scan all cached infinite-query pages (AllTasksPage uses allInfinite, not all)
  const infiniteEntries = queryClient.getQueriesData<{ pages: AllTasksResponse[] }>({
    queryKey: ["tasks", "all", "infinite"],
  })
  const infiniteTasks = infiniteEntries.flatMap(([, data]) =>
    data?.pages?.flatMap((p) => p.tasks) ?? [],
  )

  const pools = [
    ...(my?.tasks ?? []),
    ...(my?.reviewTasks ?? []),
    ...infiniteTasks,
  ]

  return pools.find((t) => t.dbId === id)
}

function resolvePlaceholder(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): TicketDetailProps | undefined {
  const shell = queryClient.getQueryData<BoardCardData>(ticketKeys.shell(id))
  const metaEntries = queryClient.getQueriesData<TasksMetaResponse>({
    queryKey: ["tasks", "meta"],
  })
  const meta = metaEntries.find(([, data]) => data)?.[1]

  if (shell) {
    return buildTicketDetailPlaceholder(shell, {
      subDepartmentStatuses: meta?.subDepartmentStatuses,
      availableMembers: meta?.availableMembers,
    })
  }

  const card = findTaskCardInCache(queryClient, id)
  if (!card) return undefined

  const my = queryClient.getQueryData<MyTasksResponse>(taskKeys.my())
  return buildTicketDetailPlaceholder(card, {
    subDepartmentStatuses: my?.subDepartmentStatusMap?.[card.subDepartmentId] ?? meta?.subDepartmentStatuses,
    availableMembers: meta?.availableMembers,
  })
}

export function useTicketDetail(id: string, initialData?: TicketDetailProps) {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: ({ signal }) => getTicketDetail(id, signal),
    enabled: !!id,
    initialData,
    placeholderData: () => initialData ?? resolvePlaceholder(queryClient, id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Always refetch when the drawer/page (re)mounts so freshly-changed ticket
    // data shows immediately. Cached data (or a board-card placeholder) paints
    // instantly via placeholderData while the fresh fetch resolves.
    refetchOnMount: "always",
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
}

export function useUpdateTicket(ticketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateTicketBody) => updateTicket(ticketId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) })
      invalidateTaskCaches(queryClient)
    },
  })
}

export function useDeleteTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTicket(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ticketKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: ticketKeys.all })
      invalidateTaskCaches(queryClient)
    },
  })
}

export function useCreateSubTicket(parentTicketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTicketBody) =>
      createTicket({ ...body, parentId: parentTicketId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(parentTicketId) })
      invalidateTaskCaches(queryClient)
    },
  })
}

export function useAddComment(ticketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AddCommentBody) => addComment(ticketId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(ticketId),
      })
    },
  })
}

export function useUpdateAssignee(ticketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assigneeId: string | null) =>
      updateTicketAssignee(ticketId, assigneeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) })
      invalidateTaskCaches(queryClient)
    },
  })
}

export function useAddCoAssignee(ticketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => addCoAssignee(ticketId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) })
      invalidateTaskCaches(queryClient)
    },
  })
}

export function useRemoveCoAssignee(ticketId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => removeCoAssignee(ticketId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) })
      invalidateTaskCaches(queryClient)
    },
  })
}
