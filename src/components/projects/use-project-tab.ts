"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSaveProjectTabPref } from "@/hooks/queries/use-preferences";
import { useProjectTabSync } from "@/components/projects/project-tab-sync";

export type ProjectTab =
  | "overview"
  | "integration"
  | "assets"
  | "tickets"
  | "sprints"
  | `team:${string}`;

function resolveProjectTab(
  rawTab: string | null,
  defaultTab: string | null,
  validTabs: ProjectTab[],
): ProjectTab {
  if (rawTab && validTabs.includes(rawTab as ProjectTab)) return rawTab as ProjectTab;
  if (defaultTab && validTabs.includes(defaultTab as ProjectTab)) return defaultTab as ProjectTab;
  return "overview";
}

type TeamGroup = { teamId: string; teamName: string };

const STATIC_PRELOAD: ProjectTab[] = ["overview", "tickets", "assets"];

export function useProjectTab({
  projectId,
  defaultTab,
  validTabs,
  teamBoardGroups,
  isPrivileged,
}: {
  projectId: string;
  defaultTab: string | null;
  validTabs: ProjectTab[];
  teamBoardGroups: TeamGroup[];
  isPrivileged: boolean;
}) {
  const searchParams = useSearchParams();
  const projectTabSync = useProjectTabSync();
  const saveTabPref = useSaveProjectTabPref();

  const [tab, setTabState] = useState<ProjectTab>(() =>
    resolveProjectTab(searchParams.get("tab"), defaultTab, validTabs),
  );
  const [mountedTabs, setMountedTabs] = useState<Set<ProjectTab>>(() => {
    const initial = resolveProjectTab(searchParams.get("tab"), defaultTab, validTabs);
    return new Set<ProjectTab>([initial]);
  });

  // Pre-mount lightweight tabs in idle time (not team boards — those mount on first visit)
  useEffect(() => {
    const idle = window.requestIdleCallback?.(
      () => {
        setMountedTabs((prev) => {
          const next = new Set(prev);
          for (const t of STATIC_PRELOAD) {
            if (validTabs.includes(t)) next.add(t);
          }
          if (isPrivileged && validTabs.includes("integration")) next.add("integration");
          return next.size === prev.size ? prev : next;
        });
      },
      { timeout: 1200 },
    );
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [validTabs, isPrivileged]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const next = resolveProjectTab(params.get("tab"), defaultTab, validTabs);
      setTabState(next);
      setMountedTabs((prev) => new Set(prev).add(next));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [defaultTab, validTabs]);

  useEffect(() => {
    const group = teamBoardGroups.find((g) => `team:${g.teamId}` === tab);
    projectTabSync?.setProjectTab(tab, group?.teamName ?? null);
  }, [tab, teamBoardGroups, projectTabSync]);

  useEffect(() => () => projectTabSync?.setProjectTab(null, null), [projectTabSync]);

  useEffect(() => {
    if (!validTabs.includes(tab)) setTabState("overview");
  }, [validTabs, tab]);

  const setTab = useCallback(
    (newTab: ProjectTab) => {
      if (!validTabs.includes(newTab) || newTab === tab) return;

      setTabState(newTab);
      setMountedTabs((prev) => (prev.has(newTab) ? prev : new Set(prev).add(newTab)));

      const params = new URLSearchParams(window.location.search);
      params.set("tab", newTab);
      const group = teamBoardGroups.find((g) => `team:${g.teamId}` === newTab);
      if (group) params.set("tabName", group.teamName);
      else params.delete("tabName");

      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );

      saveTabPref.mutate({ projectId, tab: newTab });
    },
    [tab, validTabs, teamBoardGroups, projectId, saveTabPref],
  );

  const isMounted = useCallback((t: ProjectTab) => mountedTabs.has(t), [mountedTabs]);

  return { tab, setTab, isMounted };
}
