"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LayoutData } from "./dashboard-layout";

export function DashboardBadgesHydrator({ badges, userId, activeDeptId }: {
  badges: Pick<LayoutData, "myTasksCount" | "mentionsCount" | "inboxCount">;
  userId: string;
  activeDeptId: string | null;
}) {
  const client = useQueryClient();
  useEffect(() => {
    client.setQueryData<LayoutData>(["dashboard", "layout"], (current) =>
      current?.userId === userId && current.activeDeptId === activeDeptId
        ? { ...current, ...badges } : current,
    );
  }, [client, badges, userId, activeDeptId]);
  return null;
}
