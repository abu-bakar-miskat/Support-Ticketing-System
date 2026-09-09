"use client";

import Link from "next/link";
import { useAppPathname } from "@/hooks/use-app-pathname";
import { useTenantHref } from "@/hooks/use-tenant-href";
import {
  Activity,
  Bell,
  Building2,
  Mail,
  Palette,
  Users,
  X,
} from "lucide-react";
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
  const pathname = useAppPathname();
  const href = useTenantHref();
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const storeInit = useNotificationStore((s) => s.initialized);
  const notifCount = storeInit ? storeCount : inboxCount;

  const navItems: NavItem[] = [
    { label: "Departments", href: "/departments", icon: DepartmentIcon },
    { label: "Users", href: "/departments/users", icon: Users },
    { label: "Mailboxes", href: "/departments/mailboxes", icon: Mail },
    { label: "Activity", href: "/departments/activity", icon: Activity },
    {
      label: "Notifications",
      href: "/departments/inbox",
      icon: Bell,
      badge: notifCount || undefined,
    },
    { label: "Branding", href: "/departments/branding", icon: Palette },
  ];

  return (
    <aside
      className={cn(
        "sts-glass-panel flex h-full w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3 py-3.5",
        className,
      )}
    >
      <div className="flex h-14 items-center pl-1">
        {brandingLogoUrl ? (
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brandingLogoUrl}
              alt=""
              height={36}
              className="h-9 w-auto max-w-[72px] shrink-0 object-contain"
            />
            {brandingName && (
              <span className="truncate text-[15px] font-semibold text-sts-foreground">
                {brandingName}
              </span>
            )}
          </div>
        ) : brandingName ? (
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-foreground text-sm font-semibold uppercase text-sts-bg"
            >
              {brandingName.charAt(0)}
            </span>
            <span className="truncate text-[15px] font-semibold text-sts-foreground">
              {brandingName}
            </span>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/support-logo-horizontal.png"
              alt="Support Ticketing System"
              height={56}
              className="h-14 w-auto max-w-[150px] object-contain dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/support-logo-horizontal-white.png"
              alt=""
              height={56}
              className="hidden h-14 w-auto max-w-[150px] object-contain dark:block"
            />
          </>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-sts-subtle hover:text-sts-foreground lg:hidden"
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
          className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground"
        >
          <SidebarNavIcon icon={Building2} size="sm" className="shrink-0" />
          <span className="font-sans text-[11.5px] font-medium">Platform</span>
        </Link>
      )}
      <div className="flex items-center gap-2 rounded-md bg-sts-surface px-2.5 py-2">
        <SidebarNavIcon
          icon={DepartmentIcon}
          size="sm"
          className="shrink-0 text-sts-foreground"
        />
        <span className="font-sans text-[12px] font-semibold text-sts-foreground">
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
            href={href(item.href)}
            prefetch={true}
            className={cn(
              "sts-nav-link relative flex h-7 items-center gap-2 rounded-full px-2.5 font-sans text-[13px] text-sts-muted hover:bg-sts-surface hover:text-sts-foreground",
              active && "bg-sts-surface font-semibold text-sts-foreground",
            )}
          >
            <SidebarNavIcon icon={item.icon} />
            <span className="truncate">{item.label}</span>
            {item.badge != null && (
              <>
                <span className="flex-1" />
                <span className="text-[11.5px] text-sts-subtle">
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
