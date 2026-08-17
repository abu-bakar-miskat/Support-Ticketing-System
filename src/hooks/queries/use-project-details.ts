"use client"

import { useQuery } from "@tanstack/react-query"
import { getProjectDetails } from "@/lib/api/projects"
import type { ProjectDetailsResponse } from "@/lib/api/projects"

export const projectDetailsKeys = {
  detail: (idOrSlug: string) => ["projects", "details", idOrSlug] as const,
}

export function useProjectDetails(idOrSlug: string, initialData?: ProjectDetailsResponse) {
  return useQuery({
    queryKey: projectDetailsKeys.detail(idOrSlug),
    queryFn: () => getProjectDetails(idOrSlug),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
