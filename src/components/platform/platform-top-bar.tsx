"use client";

import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FontSizeZoomControls } from "@/components/font-size/font-size-zoom-controls";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { useNotificationStore } from "@/store";

/** Slim top bar for the platform (Super Admin) section — mirrors the main
 * dashboard TopBar's right-hand controls, minus the ticket/project-specific
 * breadcrumbs and command palette which don't apply outside tenant chrome. */
export function PlatformTopBar({ onNotifClick }: { onNotifClick: () => void }) {
  const badgeCount = useNotificationStore((s) => s.unreadCount);

  return (
    <header className="pen-glass-panel flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4 lg:px-5">
      <p className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold leading-none text-pen-foreground">
        Platform
      </p>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
