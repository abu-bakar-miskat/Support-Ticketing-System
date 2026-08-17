"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createProjectSubscription } from "@/lib/realtime";
import { projectDetailsKeys } from "@/hooks/queries/use-project-details";

/** Keep project details (status, lifecycle, etc.) in sync across open views. */
export function useProjectRealtime(projectId: string, detailsQueryKey: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    return createProjectSubscription(supabase, projectId, () => {
      void queryClient.invalidateQueries({
        queryKey: projectDetailsKeys.detail(detailsQueryKey),
      });
      startTransition(() => router.refresh());
    });
  }, [projectId, detailsQueryKey, queryClient, router]);
}
