"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { fetchMyTasks, fetchAllTasks, fetchTasksMeta } from "@/lib/api/tasks";
import type { MyTasksResponse, TasksMetaResponse, AllTasksFilters } from "@/lib/api/tasks";
import { taskKeys } from "./keys";

export function useMyTasks(initialData?: MyTasksResponse) {
  return useQuery({
    queryKey: taskKeys.my(),
    queryFn: fetchMyTasks,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useAllTasks() {
  return useQuery({
    queryKey: taskKeys.all(),
    queryFn: () => fetchAllTasks(),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export type InfiniteAllTasksFilters = Omit<AllTasksFilters, "page">;

export function useInfiniteAllTasks(filters: InfiniteAllTasksFilters) {
  return useInfiniteQuery({
    // Include all filters in the key so any filter change resets to page 1
    queryKey: taskKeys.allInfinite(filters as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) =>
      fetchAllTasks({ ...filters, page: pageParam as number }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** Lightweight count-only fetch (limit: 1, reads `total`) — used for the Unassigned tab badge. */
export function useUnassignedCount(enabled: boolean) {
  return useQuery({
    queryKey: taskKeys.allInfinite({ unassigned: true, limit: 1 }),
    queryFn: () => fetchAllTasks({ unassigned: true, limit: 1 }),
    select: (data) => data.total,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useTasksMeta(enabled = true, activeDeptId?: string | null, initialData?: TasksMetaResponse) {
  return useQuery({
    queryKey: taskKeys.meta(activeDeptId),
    queryFn: fetchTasksMeta,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
