"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { createProjectBoardsSubscription } from "@/lib/realtime";
import { projectDetailsKeys } from "@/hooks/queries/use-project-details";

export function useProjectBoardsRealtime(
  projectId: string,
  detailsQueryKey: string,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    return createProjectBoardsSubscription(supabase, projectId, () => {
      void queryClient.refetchQueries({
        queryKey: projectDetailsKeys.detail(detailsQueryKey),
      });
      startTransition(() => router.refresh());
    });
  }, [projectId, detailsQueryKey, queryClient, router]);
}
