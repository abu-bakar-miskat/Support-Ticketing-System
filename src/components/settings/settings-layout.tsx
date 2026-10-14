"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppPathname } from "@/hooks/use-app-pathname";
import { useTenantHref } from "@/hooks/use-tenant-href";
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
import {
  SETTINGS_NAV_COLOR_DEFAULTS,
  type SettingsNavColors,
  type SettingsNavGroupKey,
} from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  GROUP_NAV_ACTIVE_CLASS,
  GROUP_NAV_ROW_CLASS,
  groupStyle,
} from "@/components/dashboard/sidebar-group-styles";

/** SETTINGS_NAV group label → colour key (unknown groups reuse "workspace"). */
const GROUP_COLOR_KEY: Record<string, SettingsNavGroupKey> = {
  PERSONAL: "personal",
  WORKSPACE: "workspace",
  CONFIGURATION: "configuration",
  INTEGRATIONS: "integrations",
};


/**
 * The nav item a pathname belongs to: exact match, else the longest item href
 * that prefixes it, so nested pages (/settings/departments/[id]/sla,
 * /settings/support-forms/[id]) keep their parent highlighted. "/settings"
 * (Profile) only ever matches exactly — it prefixes everything.
 */
function resolveActiveHref(items: SettingsNavItem[], pathname: string): string | undefined {
  let best: string | undefined;
  for (const { href } of items) {
    if (href === pathname) return href;
    if (href !== "/settings" && pathname.startsWith(`${href}/`) && href.length > (best?.length ?? 0)) {
      best = href;
    }
  }
  return best;
}

function SettingsNavLink({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: boolean;
}) {
  // Nav hrefs are internal (/settings/sla); prefix them with the URL's
  // tenant/dept so the proxy doesn't fall back to (possibly missing) cookies.
  const tenantHref = useTenantHref();
  return (
    <Link
      href={tenantHref(item.href)}
      aria-current={active ? "page" : undefined}
      className={cn(
        GROUP_NAV_ROW_CLASS,
        active
          ? GROUP_NAV_ACTIVE_CLASS
          : GROUP_ITEM_IDLE_CLASS,
      )}
    >
      <span className="truncate">{item.label}</span>
      {item.count != null && item.count > 0 && (
        <>
          <span className="min-w-0 flex-1" aria-hidden />
          <span
            className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-sts-id
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
  platformFlags,
  isDepartmentAdmin,
  navColors,
}: {
  activeHref: string;
  role: string;
  counts: Record<string, number>;
  isCrossAccess: boolean;
  isSuperAdmin: boolean;
  activeFeatureKeys: TemplateFeatureKey[] | "ALL";
  hasActiveDept: boolean;
  platformFlags?: Partial<Record<string, boolean>>;
  isDepartmentAdmin: boolean;
  navColors: SettingsNavColors;
}) {
  const nav = getFilteredNav(role, counts, isCrossAccess, isSuperAdmin, activeFeatureKeys, hasActiveDept, platformFlags, isDepartmentAdmin);
  const resolvedHref = resolveActiveHref(nav.flatMap((g) => g.items), activeHref);
  return (
    <nav
      aria-label="Settings"
      className="hidden w-[260px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-sts-card-border bg-sts-settings-subnav px-3 pt-3 pb-3 scrollbar-none lg:flex lg:self-stretch"
    >
      {nav.map((group) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          style={groupStyle(navColors[GROUP_COLOR_KEY[group.label] ?? "workspace"])}
          className={cn(GROUP_CARD_CLASS, "flex flex-col rounded-xl p-1")}
        >
          <p className="px-2 pt-1 pb-0.5 font-sans text-[9.5px] leading-4 font-semibold tracking-[0.9px] text-sts-subtle uppercase">
            {group.label}
          </p>
          <div className="flex flex-col gap-px">
            {group.items.map((item) => (
              <SettingsNavLink
                key={item.href}
                item={item}
                active={resolvedHref === item.href}
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
  platformFlags,
  isDepartmentAdmin,
}: {
  activeHref: string;
  role: string;
  counts: Record<string, number>;
  isCrossAccess: boolean;
  isSuperAdmin: boolean;
  activeFeatureKeys: TemplateFeatureKey[] | "ALL";
  hasActiveDept: boolean;
  platformFlags?: Partial<Record<string, boolean>>;
  isDepartmentAdmin: boolean;
}) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const nav = getFilteredNav(role, counts, isCrossAccess, isSuperAdmin, activeFeatureKeys, hasActiveDept, platformFlags, isDepartmentAdmin);
  const allItems = nav.flatMap((g) => g.items);
  const resolvedHref = resolveActiveHref(allItems, activeHref);
  const activeItem = allItems.find((item) => item.href === resolvedHref);

  return (
    <div className="border-b border-sts-card-border bg-sts-settings-subnav px-4 py-3 lg:hidden">
      <Select
        value={activeItem?.href}
        onValueChange={(href) => {
          if (href) router.push(tenantHref(href));
        }}
      >
        <SelectTrigger className="h-9 w-full font-sans text-[13px]">
          <SelectValue>{activeItem?.label ?? "Settings"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {nav.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="font-sans text-[11.5px] tracking-[1px] text-sts-subtle">
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
  platformFlags,
  isDepartmentAdmin = false,
  navColors = SETTINGS_NAV_COLOR_DEFAULTS,
}: {
  children: React.ReactNode;
  role?: string;
  counts?: Record<string, number>;
  isCrossAccess?: boolean;
  isSuperAdmin?: boolean;
  activeFeatureKeys?: TemplateFeatureKey[] | "ALL";
  hasActiveDept?: boolean;
  platformFlags?: Partial<Record<string, boolean>>;
  isDepartmentAdmin?: boolean;
  /** Accent per sub-nav group card (tenant Branding page). */
  navColors?: SettingsNavColors;
}) {
  const pathname = useAppPathname();

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 w-full flex-col overflow-hidden lg:flex-row">
      <SettingsMobileNav activeHref={pathname} role={role} counts={counts} isCrossAccess={isCrossAccess} isSuperAdmin={isSuperAdmin} activeFeatureKeys={activeFeatureKeys} hasActiveDept={hasActiveDept} platformFlags={platformFlags} isDepartmentAdmin={isDepartmentAdmin} />
      <SettingsSubNav activeHref={pathname} role={role} counts={counts} isCrossAccess={isCrossAccess} isSuperAdmin={isSuperAdmin} activeFeatureKeys={activeFeatureKeys} hasActiveDept={hasActiveDept} platformFlags={platformFlags} isDepartmentAdmin={isDepartmentAdmin} navColors={navColors} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
