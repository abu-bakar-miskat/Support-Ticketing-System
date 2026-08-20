"use client";

import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FontSizeZoomControls } from "@/components/font-size/font-size-zoom-controls";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { DualClock } from "@/components/dashboard/london-clock";
import { UpcomingCalendarBadges } from "@/components/dashboard/upcoming-holiday-badge";
import { useNotificationStore } from "@/store";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";

type DepartmentsTopBarProps = {
  onMenuClick: () => void;
  onOpenSearch: () => void;
  onNotifClick: () => void;
};

export function DepartmentsTopBar({
  onMenuClick,
  onOpenSearch,
  onNotifClick,
}: DepartmentsTopBarProps) {
  const { inboxCount } = useDashboardContext();
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const storeInit = useNotificationStore((s) => s.initialized);
  const badgeCount = storeInit ? storeCount : inboxCount;

  return (
    <header className="pen-glass-panel flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4 lg:px-5">
      <button
        type="button"
        className="rounded p-1.5 text-pen-subtle hover:text-pen-foreground lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>

      <nav className="flex min-w-0 flex-1 items-center gap-1.5" aria-label="Breadcrumb">
        <Link
          href="/departments"
          className="font-sans text-[12.5px] font-medium leading-none text-pen-muted transition-colors hover:text-pen-foreground"
        >
          Home
        </Link>
        <span className="font-sans text-[11.5px] leading-none text-pen-subtle">/</span>
        <span className="truncate font-sans text-[12.5px] font-semibold leading-none text-pen-foreground">
          Departments
        </span>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <UpcomingCalendarBadges className="mr-0.5 hidden lg:flex" />
        <DualClock compact hideBangladesh className="mr-1.5 hidden lg:flex" />

        <button
          type="button"
          onClick={onOpenSearch}
          className="flex size-7 items-center justify-center rounded-md border border-pen-card-border bg-pen-surface text-pen-subtle transition-colors hover:text-pen-foreground sm:hidden dark:border-white/10 dark:bg-white/5"
          aria-label="Open command palette"
        >
          <Search className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-7 w-36 items-center gap-2 rounded-md border border-pen-card-border bg-pen-surface px-2 text-pen-subtle transition-colors hover:text-pen-foreground sm:flex md:w-44 lg:w-48 dark:border-white/10 dark:bg-white/5 dark:text-pen-subtle dark:hover:border-white/20 dark:hover:text-pen-foreground"
          aria-label="Open command palette"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="font-sans text-[11.5px]">Search</span>
          <span className="ml-auto hidden font-mono text-[11.5px] text-pen-subtle opacity-70 md:inline">
            ⌘K
          </span>
        </button>

        <FontSizeZoomControls />
        <ThemeToggle className="size-7 rounded-lg" />

        <button
          type="button"
          onClick={onNotifClick}
          className="relative flex size-7 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-bg hover:text-pen-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {badgeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 font-sans text-[11.5px] font-medium text-white">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </button>
        <UserProfileMenu variant="topbar" />
      </div>
    </header>
  );
}
