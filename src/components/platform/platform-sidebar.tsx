"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Tags, LayoutTemplate, History, Settings, ShieldCheck, Users, Globe, PanelLeftClose, BarChart3, ClipboardCheck, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";
import { createClient } from "@/lib/supabase/client";
import { createNotificationsBroadcastSubscription } from "@/lib/realtime";
import { useAuthStore } from "@/store";

export const PLATFORM_NAV = [
  { label: "Tenants", href: "/platform", icon: Building2 },
  { label: "Reports", href: "/platform/reports", icon: BarChart3 },
  { label: "Tenant Types", href: "/platform/tenant-types", icon: Tags },
  { label: "Feature templates", href: "/platform/templates", icon: LayoutTemplate },
  { label: "Customize features", href: "/platform/feature-boards", icon: SlidersHorizontal },
  { label: "Feature approvals", href: "/platform/feature-approvals", icon: ClipboardCheck },
  { label: "Audit Log", href: "/platform/activity", icon: History },
  { label: "Email Domains", href: "/platform/email-domains", icon: Globe },
  { label: "Settings", href: "/platform/settings", icon: Settings },
  { label: "Users", href: "/platform/users", icon: Users },
  { label: "Administrators", href: "/platform/administrators", icon: ShieldCheck },
] as const;

/**
 * Left nav for the platform-level (Super Admin) area — sits outside the
 * per-tenant dashboard chrome, same rationale as SettingsSubNav
 * (components/settings/settings-layout.tsx) but for /platform/* instead of
 * /settings/*. Shares the collapse-state hook and user menu with the main
 * dashboard sidebar (components/dashboard/sidebar.tsx) for a consistent feel.
 */
export function PlatformSidebar({
  pendingFeatureRequests,
  onClose,
  className,
}: {
  pendingFeatureRequests: number;
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
        isCollapsed ? "w-[68px] px-2" : "w-[220px] px-3",
        className,
      )}
    >
      {/* Logo row */}
      <div className={cn("flex h-14 items-center", isCollapsed ? "justify-center" : "pl-1")}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggle}
            className="flex size-10 items-center justify-center rounded-full hover:bg-sts-blue-tint"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/support-icon.png" alt="Global Support Portal" width={40} height={40} className="size-10 dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/support-icon-white.png" alt="" width={40} height={40} className="hidden size-10 dark:block" />
          </button>
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
            <button
              type="button"
              onClick={onClose ?? toggle}
              className="ml-auto rounded p-1 text-sts-subtle hover:bg-sts-blue-tint hover:text-sts-foreground"
              aria-label={onClose ? "Close menu" : "Collapse sidebar"}
              title={onClose ? "Close menu" : "Collapse sidebar"}
            >
              {onClose ? <X className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </>
        )}
      </div>

      <div className="h-2" />

      {!isCollapsed && (
        <p className="px-[9px] font-sans text-[11.5px] font-semibold tracking-[1px] text-sts-subtle uppercase">
          Platform
        </p>
      )}
      <div className="h-1.5" />

      <nav aria-label="Platform" className="flex flex-1 flex-col gap-0.5">
        {PLATFORM_NAV.map((item) => {
          const active = item.href === "/platform" ? pathname === "/platform" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const badge = item.href === "/platform/feature-approvals" && pendingCount > 0 ? pendingCount : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex h-8 items-center gap-[9px] rounded-full font-sans text-[13px] transition-colors",
                isCollapsed ? "justify-center px-0" : "px-[9px]",
                active
                  ? "bg-sts-blue-tint font-semibold text-sts-foreground"
                  : "font-normal text-sts-muted hover:bg-sts-blue-tint/50 hover:text-sts-foreground",
              )}
            >
              <span className="relative shrink-0">
                <Icon className="size-4" />
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
          );
        })}
      </nav>

      {/* User */}
      <UserProfileMenu variant="sidebar" collapsed={isCollapsed} profileHref="/platform/profile" hideSettings />
    </aside>
  );
}
