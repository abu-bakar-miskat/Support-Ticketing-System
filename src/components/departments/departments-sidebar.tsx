"use client";

import Link from "next/link";
import { useAppPathname } from "@/hooks/use-app-pathname";
import { useTenantHref } from "@/hooks/use-tenant-href";
import {
  BarChart3,
  Bell,
  Building2,
  History,
  KeyRound,
  Mail,
  Palette,
  Store,
  Timer,
  Users,
  X,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { SidebarNavIcon } from "@/components/dashboard/sidebar-nav-icon";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { useNotificationStore } from "@/store";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  TENANT_SIDEBAR_GROUP_LABELS,
  type TenantSidebarColors,
  type TenantSidebarGroupKey,
} from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  GROUP_LABEL_CLASS,
  GROUP_NAV_ACTIVE_CLASS,
  GROUP_NAV_ROW_CLASS,
  groupStyle,
} from "@/components/dashboard/sidebar-group-styles";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** "admin" = tenant admins & super admins; "features" = also managers. */
  requires?: "admin" | "features";
};

/**
 * Grouped nav for the tenant departments shell. "Overview" (Platform link +
 * All Departments context row) is rendered separately since it isn't made of
 * tenant-scoped links. Exported for the Branding page's colour preview.
 */
export const DEPARTMENTS_NAV_GROUPS: { key: Exclude<TenantSidebarGroupKey, "overview">; items: NavItem[] }[] = [
  {
    key: "operations",
    items: [
      { label: "Departments", href: "/departments", icon: DepartmentIcon },
      { label: "Reports", href: "/departments/reports", icon: BarChart3 },
      { label: "SLA", href: "/departments/sla", icon: Timer },
      { label: "Notifications", href: "/departments/inbox", icon: Bell },
    ],
  },
  {
    key: "people",
    items: [
      { label: "Users", href: "/departments/users", icon: Users },
      { label: "Mailboxes", href: "/departments/mailboxes", icon: Mail },
    ],
  },
  {
    key: "tools",
    items: [
      { label: "Generate API", href: "/departments/generate-api", icon: KeyRound, requires: "admin" },
      { label: "Feature marketplace", href: "/departments/features", icon: Store, requires: "features" },
      { label: "Audit Log", href: "/departments/activity", icon: History },
      { label: "Branding", href: "/departments/branding", icon: Palette },
    ],
  },
];

export const DEPARTMENTS_OVERVIEW_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: "Platform", icon: Building2 },
  { label: "All Departments", icon: DepartmentIcon },
];

type DepartmentsSidebarProps = {
  onClose?: () => void;
  className?: string;
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
  brandingHideLogo?: boolean;
  brandingHideDisplayName?: boolean;
  sidebarColors: TenantSidebarColors;
};

export function DepartmentsSidebar({
  onClose,
  className,
  brandingName = null,
  brandingLogoUrl = null,
  brandingHideLogo = false,
  brandingHideDisplayName = false,
  sidebarColors,
}: DepartmentsSidebarProps) {
  const { isSuperAdmin, inboxCount, userRole } = useDashboardContext();
  const canSeeFeatures = isSuperAdmin || userRole === "admin" || userRole === "manager";
  const pathname = useAppPathname();
  const href = useTenantHref();
  const storeCount = useNotificationStore((s) => s.unreadCount);
  const storeInit = useNotificationStore((s) => s.initialized);
  const notifCount = storeInit ? storeCount : inboxCount;

  const isAdmin = userRole === "admin" || isSuperAdmin;
  const visible = (item: NavItem) =>
    item.requires === "admin" ? isAdmin : item.requires === "features" ? canSeeFeatures : true;

  return (
    <aside
      className={cn(
        "sts-glass-panel flex h-full w-[240px] shrink-0 flex-col overflow-y-auto border-r px-3 py-3.5",
        className,
      )}
    >
      <div className="flex h-12 items-center pl-1">
        {brandingLogoUrl || brandingName ? (
          <div className="flex min-w-0 items-center gap-2">
            {!brandingHideLogo &&
              (brandingLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandingLogoUrl}
                  alt=""
                  height={36}
                  className={cn(
                    "sts-tenant-logo w-auto shrink-0 object-contain",
                    brandingHideDisplayName ? "h-11 max-w-[150px]" : "h-9 max-w-[72px]",
                  )}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sts-foreground text-sm font-semibold uppercase text-sts-bg"
                >
                  {brandingName?.charAt(0)}
                </span>
              ))}
            {brandingName && !brandingHideDisplayName && (
              <span className="truncate text-[15px] font-semibold text-sts-foreground">
                {brandingName}
              </span>
            )}
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/support-logo-horizontal.png"
              alt="Global Support Portal"
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
      <nav aria-label="Departments" className="flex flex-col gap-1.5">
        <div
          role="group"
          aria-label={TENANT_SIDEBAR_GROUP_LABELS.overview}
          style={groupStyle(sidebarColors.overview)}
          className={cn(GROUP_CARD_CLASS, "flex flex-col gap-px rounded-xl p-1")}
        >
          <p className={GROUP_LABEL_CLASS}>{TENANT_SIDEBAR_GROUP_LABELS.overview}</p>
          {isSuperAdmin && (
            <Link
              href="/platform"
              className={cn(
                GROUP_NAV_ROW_CLASS,
                GROUP_ITEM_IDLE_CLASS,
              )}
            >
              <SidebarNavIcon icon={Building2} className="shrink-0" />
              <span className="truncate">Platform</span>
            </Link>
          )}
          <div className={cn(GROUP_NAV_ROW_CLASS, "text-sts-foreground")}>
            <SidebarNavIcon icon={DepartmentIcon} className="shrink-0" />
            <span className="truncate font-medium">All Departments</span>
          </div>
        </div>

        {DEPARTMENTS_NAV_GROUPS.map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div
              key={group.key}
              role="group"
              aria-label={TENANT_SIDEBAR_GROUP_LABELS[group.key]}
              style={groupStyle(sidebarColors[group.key])}
              className={cn(GROUP_CARD_CLASS, "flex flex-col gap-px rounded-xl p-1")}
            >
              <p className={GROUP_LABEL_CLASS}>{TENANT_SIDEBAR_GROUP_LABELS[group.key]}</p>
              {items.map((item) => {
                const active =
                  item.href === "/departments"
                    ? pathname === "/departments"
                    : pathname.startsWith(item.href);
                const badge = item.href === "/departments/inbox" && notifCount ? notifCount : null;
                return (
                  <Link
                    key={item.href}
                    href={href(item.href)}
                    prefetch={true}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      GROUP_NAV_ROW_CLASS,
                      active ? GROUP_NAV_ACTIVE_CLASS : GROUP_ITEM_IDLE_CLASS,
                    )}
                  >
                    <SidebarNavIcon icon={item.icon} />
                    <span className="truncate">{item.label}</span>
                    {badge != null && (
                      <>
                        <span className="flex-1" />
                        <span className="text-[11.5px] text-sts-subtle">{badge}</span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="h-3 flex-none" />
      <div className="flex-1" />
      {/* <InstallAppButton /> */}
      <UserProfileMenu variant="sidebar" />
    </aside>
  );
}
