"use client";

import { useState } from "react";
import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopBar } from "@/components/platform/platform-top-bar";
import { NotificationSidebar } from "@/components/dashboard/notification-sidebar";

/** Sidebar + top bar chrome for the platform (Super Admin) section, parallel
 * to DashboardLayout's Sidebar + TopBar but without the per-tenant dashboard
 * providers/state that don't apply outside tenant chrome. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <PlatformSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PlatformTopBar onNotifClick={() => setNotifOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      <NotificationSidebar open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
