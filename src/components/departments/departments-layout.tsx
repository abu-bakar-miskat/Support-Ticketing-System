"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DepartmentsSidebar } from "@/components/departments/departments-sidebar";
import { DepartmentsTopBar } from "@/components/departments/departments-top-bar";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/dashboard/command-palette";
import type { LayoutData } from "@/components/dashboard/dashboard-layout";
import { PageEnter } from "@/components/motion/page-enter";
import { NotificationsRealtime } from "@/components/realtime/notifications-realtime";
import { TabTitleBadge } from "@/components/realtime/tab-title-badge";
import { NotificationSidebar } from "@/components/dashboard/notification-sidebar";
import { DashboardProvider } from "@/components/dashboard/dashboard-context";
import { useSidebarState } from "@/hooks/use-sidebar-state";

const EMPTY: LayoutData = {
  projects: [],
  subDepartments: [],
  departments: [],
  allDepts: [],
  activeDeptId: null,
  activeDeptType: null,
  isCrossAccessDept: false,
  crossAccessDeptIds: [],
  isFullAccessDept: false,
  isManagerOfActiveDept: false,
  canAccessModules: false,
  recentTickets: [],
  projectNames: {},
  pinnedProjectIds: [],
  assignedProjectIds: [],
  myTasksCount: 0,
  mentionsCount: 0,
  inboxCount: 0,
  userRole: "",
  isSuperAdmin: false,
  userId: "",
  activeFeatureKeys: "ALL",
};

export function DepartmentsLayout({
  children,
  initialLayoutData,
  brandingName = null,
  brandingLogoUrl = null,
}: {
  children: React.ReactNode;
  initialLayoutData?: LayoutData;
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { open, setOpen } = useCommandPalette();
  const { collapsed, ready } = useSidebarState();

  const { data = initialLayoutData ?? EMPTY } = useQuery<LayoutData>({
    queryKey: ["dashboard", "layout"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/layout");
      if (!r.ok) throw new Error(`Failed to load layout (${r.status})`);
      return r.json() as Promise<LayoutData>;
    },
    staleTime: 60_000,
    initialData: initialLayoutData,
    initialDataUpdatedAt: initialLayoutData ? Date.now() : undefined,
    refetchOnWindowFocus: false,
  });

  const openSearch = useCallback(() => setOpen(true), [setOpen]);

  return (
    <DashboardProvider
      value={{
        projects: data.projects ?? EMPTY.projects,
        myTasksCount: data.myTasksCount ?? EMPTY.myTasksCount,
        mentionsCount: data.mentionsCount ?? EMPTY.mentionsCount,
        inboxCount: data.inboxCount ?? EMPTY.inboxCount,
        userId: data.userId ?? EMPTY.userId,
        recentTickets: data.recentTickets ?? EMPTY.recentTickets,
        projectNames: data.projectNames ?? EMPTY.projectNames,
        subDepartments: data.subDepartments ?? EMPTY.subDepartments,
        activeSubDepartmentId: null,
        departments: data.departments ?? EMPTY.departments,
        allDepts: data.allDepts ?? EMPTY.allDepts,
        activeDeptId: data.activeDeptId ?? EMPTY.activeDeptId,
        activeDeptType: data.activeDeptType ?? EMPTY.activeDeptType,
        isCrossAccessDept: data.isCrossAccessDept ?? EMPTY.isCrossAccessDept,
        crossAccessDeptIds: data.crossAccessDeptIds ?? EMPTY.crossAccessDeptIds,
        isFullAccessDept: data.isFullAccessDept ?? EMPTY.isFullAccessDept,
        isManagerOfActiveDept:
          data.isManagerOfActiveDept ?? EMPTY.isManagerOfActiveDept,
        canAccessModules: data.canAccessModules ?? EMPTY.canAccessModules,
        userRole: data.userRole ?? EMPTY.userRole,
        isSuperAdmin: data.isSuperAdmin ?? EMPTY.isSuperAdmin,
        activeFeatureKeys: data.activeFeatureKeys ?? EMPTY.activeFeatureKeys,
        pinnedProjectIds: data.pinnedProjectIds ?? EMPTY.pinnedProjectIds,
        assignedProjectIds: data.assignedProjectIds ?? EMPTY.assignedProjectIds,
        sidebarCollapsed: collapsed,
        sidebarReady: ready,
        toggleSidebar: () => {},
      }}
    >
      <div className="pen-ambient-bg flex h-dvh w-full overflow-hidden">
        <CommandPalette open={open} onClose={() => setOpen(false)} />

        <DepartmentsSidebar
          className="hidden lg:flex"
          brandingName={brandingName}
          brandingLogoUrl={brandingLogoUrl}
        />

        {sidebarOpen && (
          <>
            <div
              className="pen-overlay-enter fixed inset-0 z-30 pen-overlay-backdrop lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="pen-drawer-enter fixed inset-y-0 left-0 z-40 flex lg:hidden">
              <DepartmentsSidebar
                onClose={() => setSidebarOpen(false)}
                brandingName={brandingName}
                brandingLogoUrl={brandingLogoUrl}
              />
            </div>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <DepartmentsTopBar
            onMenuClick={() => setSidebarOpen(true)}
            onOpenSearch={openSearch}
            onNotifClick={() => setNotifOpen(true)}
          />
          <main className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <PageEnter>{children}</PageEnter>
          </main>
        </div>

        <NotificationSidebar open={notifOpen} onClose={() => setNotifOpen(false)} />
        <NotificationsRealtime />
        <TabTitleBadge />
      </div>
    </DashboardProvider>
  );
}
