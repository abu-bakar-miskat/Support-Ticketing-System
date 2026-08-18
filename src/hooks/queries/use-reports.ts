"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchSubDepartmentTimeReport, fetchReportsOverview } from "@/lib/api/reports"
import { reportKeys } from "./keys"

export function useSubDepartmentTimeReport(from: string, to: string, projectId = "all", personId = "all") {
  return useQuery({
    queryKey: reportKeys.subDepartmentTime(from, to, projectId, personId),
    queryFn: () => fetchSubDepartmentTimeReport(from, to, projectId, personId),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useReportsOverview(from: string, to: string, projectId = "all", personId = "all") {
  return useQuery({
    queryKey: reportKeys.overview(from, to, projectId, personId),
    queryFn: () => fetchReportsOverview(from, to, projectId, personId),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
