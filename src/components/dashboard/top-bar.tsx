"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, ChevronLeft, Menu, PanelLeft, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FontSizeZoomControls } from "@/components/font-size/font-size-zoom-controls";
import { GlobalTimerIndicator } from "@/components/dashboard/global-timer-indicator";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { DualClock } from "@/components/dashboard/london-clock";
import { UpcomingCalendarBadges } from "@/components/dashboard/upcoming-holiday-badge";
import { useBreadcrumbStore, useNotificationStore } from "@/store";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { useProjectTabSync } from "@/components/projects/project-tab-sync";
import { buildBreadcrumbs, parentCrumb } from "@/lib/breadcrumbs";
import { cn } from "@/lib/utils";

type TopBarProps = {
  onMenuClick: () => void;
  onOpenSearch: () => void;
  onNotifClick?: () => void;
};

export function TopBar({
  onMenuClick,
  onOpenSearch,
  onNotifClick,
}: TopBarProps) {
  const {
    inboxCount,
    projectNames,
    projects,
    recentTickets,
    sidebarCollapsed,
    toggleSidebar,
  } = useDashboardContext();
  const pathname = usePathname();
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const storeInit = useNotificationStore((s) => s.initialized);
  const badgeCount = storeInit ? storeCount : inboxCount;
  const searchParams = useSearchParams();
  const projectTabSync = useProjectTabSync();
  const tab = projectTabSync?.tab ?? searchParams.get("tab");
  const tabName = projectTabSync?.tabName ?? searchParams.get("tabName");
  const ticketDbId = useBreadcrumbStore((s) => s.ticketDbId);
  const ticketHumanId = useBreadcrumbStore((s) => s.ticketHumanId);
  const pageCrumbsState = useBreadcrumbStore((s) => s.pageCrumbs);

  const ticketMatch =
    pathname.match(/^\/tasks\/([^/]+)$/) ??
    pathname.match(/^\/tickets\/([^/]+)$/);
  const activeTicketHumanId =
    ticketMatch && ticketDbId === ticketMatch[1] ? ticketHumanId : null;

  const recentTicketHumanIds = Object.fromEntries(
    recentTickets.map((t) => [t.dbId, t.ticketId]),
  );

  const mergedProjectNames = {
    ...projectNames,
    ...Object.fromEntries(projects.map((p) => [p.id, p.label])),
  };

  const autoCrumbs = buildBreadcrumbs({
    pathname,
    projectNames: mergedProjectNames,
    projectTab: tab,
    projectTabName: tabName,
    ticketHumanId: activeTicketHumanId,
    recentTicketHumanIds,
  });

  const crumbs =
    pageCrumbsState?.pathname === pathname
      ? pageCrumbsState.crumbs
      : autoCrumbs;

  const backTarget = parentCrumb(crumbs);
  const currentCrumb = crumbs[crumbs.length - 1];
  // Parent is already on the back button — don't repeat it in the trail.
  const trailCrumbs =
    backTarget && crumbs.length > 1
      ? crumbs.filter((_, i) => i !== crumbs.length - 2)
      : crumbs;

  // The home and manager dashboards render their own clock in-page, so hide
  // the redundant top-bar clock on those routes.
  const hideClock = pathname === "/" || pathname === "/manager";

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

      {sidebarCollapsed && (
        <button
          type="button"
          className="hidden rounded p-1.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground lg:inline-flex"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      )}

      <nav
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
        aria-label="Breadcrumb"
      >
        {backTarget && (
          <Link
            href={backTarget.href}
            className="flex shrink-0 items-center gap-0.5 font-sans text-[12.5px] font-medium leading-none text-pen-muted transition-colors hover:text-pen-foreground"
            aria-label={`Back to ${backTarget.label}`}
            title={`Back to ${backTarget.label}`}
          >
            <ChevronLeft className="size-3.5 shrink-0" />
            <span className="hidden max-w-[120px] truncate sm:inline">{backTarget.label}</span>
          </Link>
        )}

        <span className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex">
          {backTarget && trailCrumbs.length > 0 && (
            <span className="font-sans text-[11.5px] leading-none text-pen-subtle">/</span>
          )}
          {trailCrumbs.map((crumb, i) => {
            const isLast = i === trailCrumbs.length - 1;
            const collapseMiddle = trailCrumbs.length > 3 && i > 0 && i < trailCrumbs.length - 2;

            if (collapseMiddle && i === 1) {
              return (
                <span key="ellipsis" className="hidden items-center gap-1.5 md:flex">
                  <span className="font-sans text-[11.5px] leading-none text-pen-subtle">/</span>
                  <span className="font-sans text-[11.5px] leading-none text-pen-subtle">…</span>
                </span>
              );
            }
            if (collapseMiddle && i > 1 && i < trailCrumbs.length - 2) {
              return null;
            }

            return (
              <span
                key={`${crumb.href}-${i}`}
                className="flex min-w-0 shrink-0 items-center gap-1.5"
              >
                {i > 0 && (
                  <span className="font-sans text-[11.5px] leading-none text-pen-subtle">/</span>
                )}
                {isLast ? (
                  <span
                    className="truncate font-sans text-[12.5px] font-semibold leading-none text-pen-foreground"
                    title={crumb.label}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate font-sans text-[12.5px] font-medium leading-none text-pen-muted transition-colors hover:text-pen-foreground"
                    title={crumb.label}
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </span>

        <span
          className="min-w-0 truncate font-sans text-[12.5px] font-semibold leading-none text-pen-foreground sm:hidden"
          title={currentCrumb.label}
        >
          {currentCrumb.label}
        </span>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <UpcomingCalendarBadges className="mr-0.5 hidden lg:flex" />
        {!hideClock && <DualClock compact className="mr-1.5 hidden lg:flex" />}
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
        <GlobalTimerIndicator />
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
