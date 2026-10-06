"use client";

import { useQuery } from "@tanstack/react-query";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import { ManagerDashboardSkeleton } from "@/components/skeletons/page-skeletons";
import {
  emptyManagerDashboard,
  type ManagerDashboardData,
} from "@/components/manager/manager-dashboard-data";

export function ManagerDashboardPage({ managerName }: { managerName: string }) {
  const placeholder = emptyManagerDashboard(managerName);
  const { data = placeholder, isError, refetch, isFetching, isPlaceholderData } = useQuery<ManagerDashboardData>({
    queryKey: ["dashboard", "manager"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/manager", {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("Could not load manager dashboard");
      return response.json();
    },
    staleTime: 30_000,
    placeholderData: placeholder,
    refetchOnWindowFocus: false,
  });

  // Placeholder data is all zeros — show a skeleton rather than "0" metrics and
  // misleading empty states until the real numbers arrive.
  if (isPlaceholderData && !isError) return <ManagerDashboardSkeleton />;

  const view = {
    ...data,
    managerName: data.managerName || managerName,
    digest:
      isError
        ? "Could not load your department."
        : isFetching && isPlaceholderData
          ? "Loading your department…"
          : data.digest,
  };

  return (
    <>
      {isError ? (
        <div className="px-4 pt-4 sm:px-6 xl:px-8">
          <p className="font-sans text-[13px] text-sts-muted">
            Manager stats timed out.{" "}
            <button
              type="button"
              className="font-medium text-sts-accent underline-offset-2 hover:underline"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </p>
        </div>
      ) : null}
      <ManagerDashboard {...view} />
    </>
  );
}
