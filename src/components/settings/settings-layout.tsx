"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_SETTINGS_NAV_ITEMS,
  getFilteredNav,
  type SettingsNavItem,
} from "@/components/settings/settings-nav";
import type { TemplateFeatureKey } from "@/lib/template-features";


function SettingsNavLink({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-7 items-center gap-[7px] rounded-[5px] px-[9px] font-sans text-[13px] transition-colors",
        active
          ? "border border-pen-card-border bg-pen-settings-subnav-active font-semibold text-pen-foreground"
          : "font-normal text-pen-muted hover:text-pen-foreground",
      )}
    >
      <span className="truncate">{item.label}</span>
      {item.count != null && item.count > 0 && (
        <>
          <span className="min-w-0 flex-1" aria-hidden />
          <span
            className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-pen-id
            px-[4px] font-sans text-[8.5px] font-semibold text-white"
          >
            {item.count > 99 ? "99+" : item.count}
          </span>
        </>
      )}
    </Link>
  );
}

function SettingsSubNav({
  activeHref,
  role,
  counts,
  isCrossAccess,
  isSuperAdmin,
  activeFeatureKeys,
  hasActiveDept,
}: {
  activeHref: string;
  role: string;
  counts: Record<string, number>;
  isCrossAccess: boolean;
  isSuperAdmin: boolean;
  activeFeatureKeys: TemplateFeatureKey[] | "ALL";
  hasActiveDept: boolean;
}) {
  const nav = getFilteredNav(role, counts, isCrossAccess, isSuperAdmin, activeFeatureKeys, hasActiveDept);
  return (
    <nav
      aria-label="Settings"
      className="hidden w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-pen-card-border bg-pen-settings-subnav px-[18px] pt-[22px] pb-[18px] lg:flex lg:self-stretch"
    >
      <p className="font-sans text-base font-semibold text-pen-foreground">
        Settings
      </p>
      <div className="h-3.5" />

      {nav.map((group, groupIndex) => (
        <div key={group.label}>
          {groupIndex > 0 && <div className="h-3" />}
          <p className="font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle">
            {group.label}
          </p>
          <div className="h-[3px]" />
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <SettingsNavLink
                key={item.href}
                item={item}
                active={activeHref === item.href}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SettingsMobileNav({
  activeHref,
  role,
  counts,
  isCrossAccess,
  isSuperAdmin,
  activeFeatureKeys,
  hasActiveDept,
}: {
  activeHref: string;
  role: string;
  counts: Record<string, number>;
  isCrossAccess: boolean;
  isSuperAdmin: boolean;
  activeFeatureKeys: TemplateFeatureKey[] | "ALL";
  hasActiveDept: boolean;
}) {
  const router = useRouter();
  const nav = getFilteredNav(role, counts, isCrossAccess, isSuperAdmin, activeFeatureKeys, hasActiveDept);
  const allItems = nav.flatMap((g) => g.items);
  const activeItem =
    allItems.find((item) => item.href === activeHref) ?? allItems[0];

  return (
    <div className="border-b border-pen-card-border bg-pen-settings-subnav px-4 py-3 lg:hidden">
      <Select
        value={activeItem?.href}
        onValueChange={(href) => {
          if (href) router.push(href);
        }}
      >
        <SelectTrigger className="h-9 w-full font-sans text-[13px]">
          <SelectValue>{activeItem?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {nav.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="font-sans text-[11.5px] tracking-[1px] text-pen-subtle">
                {group.label}
              </SelectLabel>
              {group.items.map((item) => (
                <SelectItem
                  key={item.href}
                  value={item.href}
                  className="font-sans text-[13px]"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SettingsLayout({
  children,
  role = "agent",
  counts = {},
  isCrossAccess = false,
  isSuperAdmin = false,
  activeFeatureKeys = "ALL",
  hasActiveDept = true,
}: {
  children: React.ReactNode;
  role?: string;
  counts?: Record<string, number>;
  isCrossAccess?: boolean;
  isSuperAdmin?: boolean;
  activeFeatureKeys?: TemplateFeatureKey[] | "ALL";
  hasActiveDept?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 w-full flex-col overflow-hidden lg:flex-row">
      <SettingsMobileNav activeHref={pathname} role={role} counts={counts} isCrossAccess={isCrossAccess} isSuperAdmin={isSuperAdmin} activeFeatureKeys={activeFeatureKeys} hasActiveDept={hasActiveDept} />
      <SettingsSubNav activeHref={pathname} role={role} counts={counts} isCrossAccess={isCrossAccess} isSuperAdmin={isSuperAdmin} activeFeatureKeys={activeFeatureKeys} hasActiveDept={hasActiveDept} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
