"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutTemplate, History, Settings, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { UserProfileMenu } from "@/components/dashboard/user-profile-menu";

const PLATFORM_NAV = [
  { label: "Tenants", href: "/platform", icon: Building2 },
  { label: "Templates", href: "/platform/templates", icon: LayoutTemplate },
  { label: "Activity Log", href: "/platform/activity", icon: History },
  { label: "Settings", href: "/platform/settings", icon: Settings },
] as const;

/**
 * Left nav for the platform-level (Super Admin) area — sits outside the
 * per-tenant dashboard chrome, same rationale as SettingsSubNav
 * (components/settings/settings-layout.tsx) but for /platform/* instead of
 * /settings/*. Shares the collapse-state hook and user menu with the main
 * dashboard sidebar (components/dashboard/sidebar.tsx) for a consistent feel.
 */
export function PlatformSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, ready } = useSidebarState();
  const isCollapsed = ready && collapsed;

  return (
    <aside
      className={cn(
        "pen-glass-panel flex h-full shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r py-3.5 transition-[width,padding] duration-200 ease-in-out",
        isCollapsed ? "w-[68px] px-2" : "w-[220px] px-3",
      )}
    >
      {/* Logo row */}
      <div className={cn("flex h-12 items-center", isCollapsed ? "justify-center" : "pl-1")}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggle}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-pen-blue-tint"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/pen-dot.svg" alt="PEN" width={20} height={20} className="size-5" />
          </button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/pen-logo-light.svg" alt="PEN Group" width={116} height={36} className="dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pen-logo-dark.svg"
              alt="PEN Group"
              width={116}
              height={36}
              className="hidden dark:block"
            />
            <button
              type="button"
              onClick={toggle}
              className="ml-auto rounded p-1 text-pen-subtle hover:bg-pen-blue-tint hover:text-pen-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className="h-2" />

      {!isCollapsed && (
        <p className="px-[9px] font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle uppercase">
          Platform
        </p>
      )}
      <div className="h-1.5" />

      <nav aria-label="Platform" className="flex flex-1 flex-col gap-0.5">
        {PLATFORM_NAV.map((item) => {
          const active = item.href === "/platform" ? pathname === "/platform" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex h-8 items-center gap-[9px] rounded-[6px] font-sans text-[13px] transition-colors",
                isCollapsed ? "justify-center px-0" : "px-[9px]",
                active
                  ? "bg-pen-blue-tint font-semibold text-pen-foreground"
                  : "font-normal text-pen-muted hover:bg-pen-blue-tint/50 hover:text-pen-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <UserProfileMenu variant="sidebar" collapsed={isCollapsed} profileHref="/platform/profile" hideSettings />
    </aside>
  );
}
