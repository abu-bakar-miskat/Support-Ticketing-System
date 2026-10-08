"use client";

import { Tip } from "@/components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Building2, Tags, LayoutTemplate, History, Settings, ShieldCheck, Users, Globe, PanelLeftClose, BarChart3, ClipboardCheck, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavIcon } from "@/components/dashboard/sidebar-nav-icon";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { createClient } from "@/lib/supabase/client";
import { createNotificationsBroadcastSubscription } from "@/lib/realtime";
import { useAuthStore } from "@/store";
import {
  PLATFORM_SIDEBAR_GROUP_LABELS,
  type PlatformSidebarColors,
  type PlatformSidebarGroupKey,
} from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  GROUP_LABEL_CLASS,
  GROUP_NAV_ACTIVE_CLASS,
  GROUP_NAV_ROW_CLASS,
  groupStyle,
} from "@/components/dashboard/sidebar-group-styles";

export const PLATFORM_NAV_GROUPS: {
  key: PlatformSidebarGroupKey;
  items: { label: string; href: string; icon: LucideIcon }[];
}[] = [
  {
    key: "organization",
    items: [
      { label: "Tenants", href: "/platform", icon: Building2 },
      { label: "Users", href: "/platform/users", icon: Users },
      { label: "Administrators", href: "/platform/administrators", icon: ShieldCheck },
    ],
  },
  {
    key: "analytics",
    items: [
      { label: "Reports", href: "/platform/reports", icon: BarChart3 },
      { label: "Audit Log", href: "/platform/activity", icon: History },
    ],
  },
  {
    key: "features",
    items: [
      { label: "Tenant Types", href: "/platform/tenant-types", icon: Tags },
      { label: "Feature templates", href: "/platform/templates", icon: LayoutTemplate },
      { label: "Customize features", href: "/platform/feature-boards", icon: SlidersHorizontal },
      { label: "Feature approvals", href: "/platform/feature-approvals", icon: ClipboardCheck },
    ],
  },
  {
    key: "system",
    items: [
      { label: "Email Domains", href: "/platform/email-domains", icon: Globe },
      { label: "Settings", href: "/platform/settings", icon: Settings },
    ],
  },
];

export const PLATFORM_NAV = PLATFORM_NAV_GROUPS.flatMap((group) => group.items);

/**
 * Left nav for the platform-level (Super Admin) area — sits outside the
 * per-tenant dashboard chrome, same rationale as SettingsSubNav
 * (components/settings/settings-layout.tsx) but for /platform/* instead of
 * /settings/*. Shares the collapse-state hook and user menu with the main
 * dashboard sidebar (components/dashboard/sidebar.tsx) for a consistent feel.
 */
export function PlatformSidebar({
  pendingFeatureRequests,
  colors,
  onClose,
  className,
}: {
  pendingFeatureRequests: number;
  colors: PlatformSidebarColors;
  /** Set when rendered as the mobile drawer: always expanded, and the header
   * button / nav clicks close the drawer instead of collapsing. */
  onClose?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { collapsed, toggle, ready } = useSidebarState();
  const isCollapsed = !onClose && ready && collapsed;
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const [pendingCount, setPendingCount] = useState(pendingFeatureRequests);

  useEffect(() => {
    setPendingCount(pendingFeatureRequests);
  }, [pendingFeatureRequests]);

  const seenRequestIds = useRef(new Set<string>());
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    return createNotificationsBroadcastSubscription(supabase, userId, (payload) => {
      if (payload.type !== "feature_request_submitted" || seenRequestIds.current.has(payload.id)) return;
      seenRequestIds.current.add(payload.id);
      setPendingCount((count) => count + 1);
    });
  }, [userId]);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "hidden") return;
      fetch("/api/admin/feature-requests/count")
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { count?: number } | null) => {
          if (typeof body?.count === "number") setPendingCount(body.count);
        })
        .catch(() => undefined);
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  return (
    <aside
      className={cn(
        "sts-glass-panel flex h-full shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r py-3.5 transition-[width,padding] duration-200 ease-in-out",
        isCollapsed ? "w-[68px] px-2" : "w-[240px] px-3",
        className,
      )}
    >
      {/* Logo row */}
      <div className={cn("flex h-12 items-center", isCollapsed ? "justify-center" : "pl-1")}>
        {isCollapsed ? (
          <Tip label="Expand sidebar" side="right">
            <button
              type="button"
              onClick={toggle}
              className="flex size-10 items-center justify-center rounded-full hover:bg-sts-blue-tint"
              aria-label="Expand sidebar"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/support-icon.png" alt="Global Support Portal" width={40} height={40} className="size-10 dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/support-icon-white.png" alt="" width={40} height={40} className="hidden size-10 dark:block" />
            </button>
          </Tip>
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
            <Tip label={onClose ? "Close menu" : "Collapse sidebar"}>
              <button
                type="button"
                onClick={onClose ?? toggle}
                className="ml-auto rounded p-1 text-sts-subtle hover:bg-sts-blue-tint hover:text-sts-foreground"
                aria-label={onClose ? "Close menu" : "Collapse sidebar"}
              >
                {onClose ? <X className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </Tip>
          </>
        )}
      </div>

      <div className="h-2" />

      <nav aria-label="Platform" className="flex flex-1 flex-col gap-1.5">
        {PLATFORM_NAV_GROUPS.map((group) => (
          <div
            key={group.key}
            role="group"
            aria-label={PLATFORM_SIDEBAR_GROUP_LABELS[group.key]}
            style={groupStyle(colors[group.key])}
            className={cn(GROUP_CARD_CLASS, "flex flex-col gap-px rounded-xl p-1")}
          >
            {!isCollapsed && (
              <p className={GROUP_LABEL_CLASS}>
                {PLATFORM_SIDEBAR_GROUP_LABELS[group.key]}
              </p>
            )}
            {group.items.map((item) => {
              const active = item.href === "/platform" ? pathname === "/platform" : pathname.startsWith(item.href);
              const badge = item.href === "/platform/feature-approvals" && pendingCount > 0 ? pendingCount : null;
              return (
                <Tip key={item.href} label={isCollapsed ? item.label : undefined} side="right">
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    aria-label={isCollapsed ? (badge != null ? `${item.label} (${badge} pending)` : item.label) : undefined}
                    className={cn(
                      GROUP_NAV_ROW_CLASS,
                      isCollapsed && "justify-center px-0",
                      active ? GROUP_NAV_ACTIVE_CLASS : GROUP_ITEM_IDLE_CLASS,
                    )}
                  >
                    <span className="relative shrink-0">
                      <SidebarNavIcon icon={item.icon} />
                      {isCollapsed && badge != null && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 font-sans text-[11.5px] font-medium text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {!isCollapsed && badge != null && (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-sans text-[11.5px] font-medium text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                </Tip>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="h-3" />

      {/* User */}
      <UserProfileMenu variant="sidebar" collapsed={isCollapsed} profileHref="/platform/profile" hideSettings />
    </aside>
  );
}
