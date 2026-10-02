"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/dashboard/command-palette";
import type {
  SidebarProject,
  SubDepartmentItem,
  DeptNode,
} from "@/components/dashboard/sidebar";
import type { RecentTicket } from "@/components/dashboard/command-palette";
import { PageEnter } from "@/components/motion/page-enter";
import { TicketDrawerRoot } from "@/components/tickets/ticket-drawer";
import { DepartmentWalkthroughHost } from "@/components/departments/department-walkthrough";
import { NotificationsRealtime } from "@/components/realtime/notifications-realtime";
import { TabTitleBadge } from "@/components/realtime/tab-title-badge";
import { NotificationSidebar } from "@/components/dashboard/notification-sidebar";
import { DashboardProvider } from "@/components/dashboard/dashboard-context";
import { FeatureRouteGuard } from "@/components/dashboard/feature-route-guard";
import { ProjectTabSyncProvider } from "@/components/projects/project-tab-sync";
import { TimerHydrator } from "@/components/providers/timer-hydrator";
import { AvailabilityProvider } from "@/components/providers/availability-provider";
import { TicketsRealtime } from "@/components/realtime/tickets-realtime";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { useTasksMeta } from "@/hooks/queries/use-tasks";
import { cn } from "@/lib/utils";
import type { TemplateFeatureKey } from "@/lib/template-features";

// ── Exported type — consumed by the API route ─────────────────────────────────

export type LayoutData = {
  projects: SidebarProject[];
  subDepartments: SubDepartmentItem[];
  departments: DeptNode[];
  allDepts: { id: string; name: string }[];
  activeDeptId: string | null;
  activeDeptType: string | null;
  isCrossAccessDept: boolean;
  crossAccessDeptIds: string[];
  isFullAccessDept: boolean;
  isManagerOfActiveDept: boolean;
  canAdminActiveDeptSettings: boolean;
  canAccessModules: boolean;
  recentTickets: RecentTicket[];
  projectNames: Record<string, string>;
  pinnedProjectIds: string[];
  assignedProjectIds: string[];
  myTasksCount: number;
  mentionsCount: number;
  inboxCount: number;
  userRole: string;
  isSuperAdmin: boolean;
  userId: string;
  activeFeatureKeys: TemplateFeatureKey[] | "ALL";
  platformFlags: Record<string, boolean>;
};

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
  canAdminActiveDeptSettings: false,
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
  platformFlags: {},
};

export function DashboardLayout({
  children,
  initialLayoutData,
  brandingName = null,
  brandingLogoUrl = null,
  brandingHideLogo = false,
  brandingHideDisplayName = false,
}: {
  children: React.ReactNode;
  initialLayoutData?: LayoutData;
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
  brandingHideLogo?: boolean;
  brandingHideDisplayName?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const { open, setOpen } = useCommandPalette();
  const { collapsed, toggle, ready } = useSidebarState();
  const heldKeys = useRef(new Set<string>());

  const { data = EMPTY } = useQuery<LayoutData>({
    queryKey: ["dashboard", "layout", initialLayoutData?.userId],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/layout", {
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Failed to load layout (${r.status})`);
      return r.json() as Promise<LayoutData>;
    },
    staleTime: 60_000,
    // Seed paints immediately (including the department feature allowlist).
    // Treat it as stale so the full layout still loads — global refetchOnMount
    // is false, and fresh initialData would otherwise stick at "every feature".
    initialData: initialLayoutData,
    initialDataUpdatedAt: initialLayoutData ? 0 : undefined,
    refetchOnMount: "always",
    placeholderData: initialLayoutData ?? EMPTY,
    refetchOnWindowFocus: false,
  });

  const { data: taskMeta, isError: taskMetaError, refetch: retryTaskMeta } = useTasksMeta(showCreateTask);

  const openCreateTask = useCallback(() => setShowCreateTask(true), []);

  // X+Space — create task (skip when typing in an input/textarea)
  useEffect(() => {
    const isEditable = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = (el as HTMLElement).tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (el as HTMLElement).isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      heldKeys.current.add(e.code);
      if (e.code === "Space" && heldKeys.current.has("KeyX") && !isEditable()) {
        e.preventDefault();
        setShowCreateTask((v) => !v);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.current.delete(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

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
        canAdminActiveDeptSettings:
          data.canAdminActiveDeptSettings ?? EMPTY.canAdminActiveDeptSettings,
        canAccessModules: data.canAccessModules ?? EMPTY.canAccessModules,
        userRole: data.userRole ?? EMPTY.userRole,
        isSuperAdmin: data.isSuperAdmin ?? EMPTY.isSuperAdmin,
        activeFeatureKeys: data.activeFeatureKeys ?? EMPTY.activeFeatureKeys,
        platformFlags: data.platformFlags ?? EMPTY.platformFlags,
        pinnedProjectIds: data.pinnedProjectIds ?? EMPTY.pinnedProjectIds,
        assignedProjectIds: data.assignedProjectIds ?? EMPTY.assignedProjectIds,
        sidebarCollapsed: collapsed,
        sidebarReady: ready,
        toggleSidebar: toggle,
      }}
    >
      <AvailabilityProvider>
      <div
        className={cn(
          "sts-ambient-bg flex h-dvh w-full overflow-hidden",
          ready && collapsed && "sts-sidebar-collapsed",
        )}
      >
        <CommandPalette open={open} onClose={() => setOpen(false)} />

        {/* Sidebar — desktop / tablet landscape */}
        <Sidebar
          className="hidden lg:flex"
          collapsed={collapsed}
          onToggleCollapse={toggle}
          onOpenSearch={() => setOpen(true)}
          onCreateTask={openCreateTask}
          brandingName={brandingName}
          brandingLogoUrl={brandingLogoUrl}
          brandingHideLogo={brandingHideLogo}
          brandingHideDisplayName={brandingHideDisplayName}
        />

        {/* Sidebar — mobile & tablet portrait drawer */}
        {sidebarOpen && (
          <>
            <div
              className="sts-overlay-enter fixed inset-0 z-30 sts-overlay-backdrop lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="sts-drawer-enter fixed inset-y-0 left-0 z-40 flex lg:hidden">
              <Sidebar
                isDrawer
                onClose={() => setSidebarOpen(false)}
                onOpenSearch={() => {
                  setSidebarOpen(false);
                  setOpen(true);
                }}
                onCreateTask={openCreateTask}
                brandingName={brandingName}
                brandingLogoUrl={brandingLogoUrl}
                brandingHideLogo={brandingHideLogo}
                brandingHideDisplayName={brandingHideDisplayName}
              />
            </div>
          </>
        )}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            onMenuClick={() => setSidebarOpen(true)}
            onOpenSearch={() => setOpen(true)}
            onNotifClick={() => setNotifOpen(true)}
          />
          <main className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <ProjectTabSyncProvider>
              <FeatureRouteGuard>
                <PageEnter>{children}</PageEnter>
              </FeatureRouteGuard>
            </ProjectTabSyncProvider>
          </main>
        </div>

        <TicketDrawerRoot />
        <DepartmentWalkthroughHost />
        <NotificationSidebar
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
        />
        <NotificationsRealtime />
        <TabTitleBadge />
        <TimerHydrator />
        <TicketsRealtime />

        {/* Global new-task modal — triggered by sidebar + or X+Space.
            Opens instantly; data-dependent fields shimmer until task meta loads. */}
        {showCreateTask && (
          <NewTicketModal
            projects={taskMeta?.availableProjects ?? []}
            subDepartmentMembers={taskMeta?.availableMembers ?? []}
            defaultSubDepartmentId={taskMeta?.defaultSubDepartmentId ?? undefined}
            subDepartments={taskMeta?.availableSubDepartments ?? []}
            departmentName={taskMeta?.departmentName ?? undefined}
            statuses={(taskMeta?.subDepartmentStatuses ?? []).map((s) => ({
              id: s.id,
              label: s.label,
              color: s.color,
            }))}
            metaLoading={!taskMeta}
            metaError={taskMetaError}
            onRetryMeta={() => retryTaskMeta()}
            membersLoading={!taskMeta}
            onClose={() => setShowCreateTask(false)}
            onCreated={() => setShowCreateTask(false)}
          />
        )}
      </div>
      </AvailabilityProvider>
    </DashboardProvider>
  );
}
