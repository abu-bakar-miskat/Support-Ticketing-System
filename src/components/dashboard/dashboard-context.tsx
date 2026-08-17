"use client";

import { createContext, useContext } from "react";
import type { SidebarProject, TeamItem, DeptNode } from "@/components/dashboard/sidebar";
import type { RecentTicket } from "@/components/dashboard/command-palette";

export type DashboardContextValue = {
  projects: SidebarProject[];
  myTasksCount: number;
  mentionsCount: number;
  inboxCount: number;
  userId: string;
  recentTickets: RecentTicket[];
  projectNames: Record<string, string>;
  teams: TeamItem[];
  activeTeamId: string | null;
  departments: DeptNode[];
  allDepts: { id: string; name: string }[];
  activeDeptId: string | null;
  activeDeptType: string | null;
  isCrossAccessDept: boolean;
  crossAccessDeptIds: string[];
  isFullAccessDept: boolean;
  isManagerOfActiveDept: boolean;
  canAccessModules: boolean;
  userRole: string;
  isSuperAdmin: boolean;
  pinnedProjectIds: string[];
  assignedProjectIds: string[];
  sidebarCollapsed: boolean;
  sidebarReady: boolean;
  toggleSidebar: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DashboardContextValue;
}) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardContext must be used within DashboardProvider");
  return ctx;
}
