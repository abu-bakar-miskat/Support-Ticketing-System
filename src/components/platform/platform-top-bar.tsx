"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { PLATFORM_NAV } from "@/components/platform/platform-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FontSizeZoomControls } from "@/components/font-size/font-size-zoom-controls";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { useNotificationStore } from "@/store";

/** Slim top bar for the platform (Super Admin) section — mirrors the main
 * dashboard TopBar's right-hand controls, minus the ticket/project-specific
 * breadcrumbs and command palette which don't apply outside tenant chrome. */
export function PlatformTopBar({
  onNotifClick,
  onMenuClick,
}: {
  onNotifClick: () => void;
  onMenuClick?: () => void;
}) {
  const badgeCount = useNotificationStore((s) => s.unreadCount);
  const pathname = usePathname();
  // Show where you are instead of a fixed "Platform" label.
  const current = [...PLATFORM_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => (item.href === "/platform" ? pathname === "/platform" : pathname.startsWith(item.href)));

  return (
    <header className="sts-glass-panel flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4 lg:px-5">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-sts-muted hover:bg-sts-bg hover:text-sts-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
      )}
      <p className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold leading-none text-sts-foreground">
        <span className="text-sts-subtle">Platform</span>
        {current && current.href !== "/platform" ? <> / {current.label}</> : current ? <> / Tenants</> : null}
      </p>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <FontSizeZoomControls />
        <ThemeToggle className="size-7 rounded-full" />
        <button
          type="button"
          onClick={onNotifClick}
          className="relative flex size-7 items-center justify-center rounded-full text-sts-muted transition-colors hover:bg-sts-bg hover:text-sts-foreground"
          aria-label={badgeCount > 0 ? `Notifications, ${badgeCount} unread` : "Notifications"}
        >
          <Bell className="size-4" />
          {badgeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 font-sans text-[11.5px] font-medium text-white">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </button>
        <UserProfileMenu variant="topbar" profileHref="/platform/profile" hideSettings />
      </div>
    </header>
  );
}
