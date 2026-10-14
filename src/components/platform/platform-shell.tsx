"use client";

import { useEffect, useState } from "react";
import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopBar } from "@/components/platform/platform-top-bar";
import { NotificationSidebar } from "@/components/dashboard/notification-sidebar";
import type { PlatformSidebarColors } from "@/lib/sidebar-colors";

/** Sidebar + top bar chrome for the platform (Super Admin) section, parallel
 * to DashboardLayout's Sidebar + TopBar but without the per-tenant dashboard
 * providers/state that don't apply outside tenant chrome. */
export function PlatformShell({
  children,
  pendingFeatureRequests,
  sidebarColors,
}: {
  children: React.ReactNode;
  pendingFeatureRequests: number;
  sidebarColors: PlatformSidebarColors;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  // Below lg the sidebar becomes a drawer (same pattern as DepartmentsLayout).
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <PlatformSidebar
        pendingFeatureRequests={pendingFeatureRequests}
        colors={sidebarColors}
        className="hidden lg:flex"
      />
      {drawerOpen && (
        <>
          <div
            className="sts-overlay-enter fixed inset-0 z-30 sts-overlay-backdrop lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Platform navigation"
            className="sts-drawer-enter fixed inset-y-0 left-0 z-40 flex lg:hidden"
          >
            <PlatformSidebar
              pendingFeatureRequests={pendingFeatureRequests}
              colors={sidebarColors}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PlatformTopBar onNotifClick={() => setNotifOpen(true)} onMenuClick={() => setDrawerOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      <NotificationSidebar open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
