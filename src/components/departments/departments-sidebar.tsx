"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Settings2, X } from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { SidebarNavIcon } from "@/components/dashboard/sidebar-nav-icon";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { useNotificationStore } from "@/store";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

type DepartmentsSidebarProps = {
  onClose?: () => void;
  className?: string;
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
};

export function DepartmentsSidebar({
  onClose,
  className,
  brandingName = null,
  brandingLogoUrl = null,
}: DepartmentsSidebarProps) {
  const { isSuperAdmin, inboxCount } = useDashboardContext();
  const pathname = usePathname();
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const storeInit = useNotificationStore((s) => s.initialized);
  const notifCount = storeInit ? storeCount : inboxCount;

  const navItems: NavItem[] = [
    { label: "Departments", href: "/departments", icon: DepartmentIcon },
    {
      label: "Notifications",
      href: "/inbox",
      icon: Bell,
      badge: notifCount || undefined,
    },
    { label: "Settings", href: "/settings", icon: Settings2 },
  ];

  return (
    <aside
      className={cn(
        "pen-glass-panel flex h-full w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3 py-3.5",
        className,
      )}
    >
      <div className="flex h-12 items-center pl-1">
        {brandingLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandingLogoUrl}
            alt={brandingName ?? "Logo"}
            height={36}
            className="h-9 w-auto max-w-[140px] object-contain"
          />
        ) : brandingName ? (
          <span className="truncate text-[15px] font-semibold text-pen-foreground">
            {brandingName}
          </span>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pen-logo-light.svg"
              alt="PEN Group"
              width={116}
              height={36}
              className="dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pen-logo-dark.svg"
              alt="PEN Group"
              width={116}
              height={36}
              className="hidden dark:block"
            />
          </>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-pen-subtle hover:text-pen-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="h-2" />

      {isSuperAdmin && (
        <Link
          href="/platform"
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
        >
          <SidebarNavIcon icon={Building2} size="sm" className="shrink-0" />
          <span className="font-sans text-[11.5px] font-medium">Platform</span>
        </Link>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-pen-blue/30 bg-pen-blue-tint px-2.5 py-2">
        <SidebarNavIcon
          icon={DepartmentIcon}
          size="sm"
          className="shrink-0 text-pen-blue"
        />
        <span className="font-sans text-[12px] font-semibold text-pen-id">
          All Departments
        </span>
      </div>

      <div className="h-2" />

      {navItems.map((item) => {
        const active =
          item.href === "/departments"
            ? pathname === "/departments"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={cn(
              "pen-nav-link relative flex h-7 items-center gap-2 rounded-md px-2.5 font-sans text-[13px] text-pen-foreground hover:bg-pen-blue-tint",
              active && "bg-pen-blue-tint font-semibold text-pen-id",
            )}
          >
            <SidebarNavIcon icon={item.icon} />
            <span className="truncate">{item.label}</span>
            {item.badge != null && (
              <>
                <span className="flex-1" />
                <span className="text-[11.5px] text-pen-subtle">
                  {item.badge}
                </span>
              </>
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      {/* <InstallAppButton /> */}
      <UserProfileMenu variant="sidebar" />
    </aside>
  );
}
