"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updatePinnedProjects } from "@/lib/api/preferences";
import { preferencesKeys } from "@/hooks/queries/use-preferences";
import type { LayoutData } from "@/components/dashboard/dashboard-layout";

const LAYOUT_QUERY_KEY = ["dashboard", "layout"] as const;

function syncPinnedProjectIds(
  queryClient: ReturnType<typeof useQueryClient>,
  ids: string[],
) {
  queryClient.setQueryData<LayoutData>(LAYOUT_QUERY_KEY, (old) =>
    old ? { ...old, pinnedProjectIds: ids } : old,
  );
  queryClient.setQueryData(preferencesKeys.all, (old: unknown) => {
    if (!old || typeof old !== "object" || Array.isArray(old)) {
      return { pinnedProjectIds: ids };
    }
    return { ...(old as Record<string, unknown>), pinnedProjectIds: ids };
  });
}

/** Pin state backed by the signed-in user's profile preferences. */
export function usePinnedProjects(initialPins: string[]) {
  const queryClient = useQueryClient();
  const [pins, setPins] = useState(() => new Set(initialPins));

  useEffect(() => {
    setPins(new Set(initialPins));
  }, [initialPins]);

  const persistPins = useCallback(
    async (next: Set<string>) => {
      const ids = [...next];
      const previous = new Set(pins);
      setPins(new Set(next));
      syncPinnedProjectIds(queryClient, ids);

      try {
        const saved = await updatePinnedProjects(ids);
        const savedIds = saved.pinnedProjectIds ?? ids;
        setPins(new Set(savedIds));
        syncPinnedProjectIds(queryClient, savedIds);
      } catch {
        setPins(previous);
        syncPinnedProjectIds(queryClient, [...previous]);
        queryClient.invalidateQueries({ queryKey: LAYOUT_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: preferencesKeys.all });
      }
    },
    [queryClient, pins],
  );

  const togglePin = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const next = new Set(pins);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      void persistPins(next);
    },
    [pins, persistPins],
  );

  return { pins, togglePin };
}
