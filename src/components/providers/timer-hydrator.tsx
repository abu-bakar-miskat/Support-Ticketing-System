"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "@/store";
import { useAuthStore } from "@/store";
import { createClient } from "@/lib/supabase/client";
import { createTimerBroadcastSubscription } from "@/lib/realtime";
import { ticketKeys, taskKeys, timeKeys } from "@/hooks/queries/keys";

/**
 * Hydrates the timer store on mount and keeps it in sync via Realtime broadcast
 * whenever any tab or component starts/stops a timer.
 */
export function TimerHydrator() {
  const queryClient = useQueryClient();
  const syncFromServer = useTimerStore((s) => s.syncFromServer);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    return createTimerBroadcastSubscription(supabase, userId, () => {
      void syncFromServer().then(() => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: timeKeys.entries() }),
          queryClient.invalidateQueries({ queryKey: taskKeys.my() }),
          queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
        ]);
      });
    });
  }, [userId, syncFromServer, queryClient]);

  return null;
}
