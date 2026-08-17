"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ProjectTabSyncValue = {
  tab: string | null;
  tabName: string | null;
  setProjectTab: (tab: string | null, tabName: string | null) => void;
};

const ProjectTabSyncContext = createContext<ProjectTabSyncValue | null>(null);

export function ProjectTabSyncProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<string | null>(null);
  const [tabName, setTabName] = useState<string | null>(null);

  const setProjectTab = useCallback((nextTab: string | null, nextTabName: string | null) => {
    setTab(nextTab);
    setTabName(nextTabName);
  }, []);

  const value = useMemo(
    () => ({ tab, tabName, setProjectTab }),
    [tab, tabName, setProjectTab],
  );

  return (
    <ProjectTabSyncContext.Provider value={value}>{children}</ProjectTabSyncContext.Provider>
  );
}

export function useProjectTabSync() {
  return useContext(ProjectTabSyncContext);
}
