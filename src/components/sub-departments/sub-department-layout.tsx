"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppPathname } from "@/hooks/use-app-pathname";
import { useTenantHref } from "@/hooks/use-tenant-href";
import { ArrowLeft } from "lucide-react";
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
  getSubDepartmentNav,
  type SubDepartmentNavItem,
} from "@/components/sub-departments/sub-department-nav";
import {
  SETTINGS_NAV_COLOR_DEFAULTS,
  type SettingsNavColors,
} from "@/lib/sidebar-colors";
import {
  GROUP_CARD_CLASS,
  GROUP_ITEM_IDLE_CLASS,
  GROUP_LABEL_CLASS,
  GROUP_NAV_ACTIVE_CLASS,
  GROUP_NAV_ROW_CLASS,
  groupStyle,
} from "@/components/dashboard/sidebar-group-styles";

/** Compare pathname and href tolerant of URL encoding of the [name] segment. */
function isActiveHref(pathname: string, href: string) {
  try {
    return decodeURIComponent(pathname) === decodeURIComponent(href);
  } catch {
    return pathname === href;
  }
}

function SubDepartmentNavLink({
  item,
  active,
}: {
  item: SubDepartmentNavItem;
  active: boolean;
}) {
  // Prefix with the URL's tenant/dept so the proxy doesn't fall back to cookies.
  const tenantHref = useTenantHref();
  return (
    <Link
      href={tenantHref(item.href)}
      aria-current={active ? "page" : undefined}
      className={cn(GROUP_NAV_ROW_CLASS, active ? GROUP_NAV_ACTIVE_CLASS : GROUP_ITEM_IDLE_CLASS)}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SubDepartmentSubNav({
  name,
  title,
  subtitle,
  activeHref,
  navColors,
}: {
  name: string;
  title: string;
  subtitle?: string;
  activeHref: string;
  navColors: SettingsNavColors;
}) {
  const nav = getSubDepartmentNav(name);
  const tenantHref = useTenantHref();
  return (
    <nav
      aria-label="Sub-department"
      className="hidden w-[260px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-sts-card-border bg-sts-settings-subnav px-3 pt-3 pb-3 scrollbar-none lg:flex lg:self-stretch"
    >
      <div className="px-2 pt-1 pb-1.5">
        <Link
          href={tenantHref("/sub-departments")}
          className="flex items-center gap-1 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:text-sts-foreground"
        >
          <ArrowLeft className="size-3" />
          Sub-departments
        </Link>
        <p className="mt-2 truncate font-sans text-base font-semibold text-sts-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="truncate font-sans text-[11.5px] text-sts-subtle">{subtitle}</p>
        )}
      </div>

      {nav.map((group) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          // Same accent as the Settings sidebar's Workspace card (tenant Branding).
          style={groupStyle(navColors.workspace)}
          className={cn(GROUP_CARD_CLASS, "flex flex-col rounded-xl p-1")}
        >
          <p className={GROUP_LABEL_CLASS}>{group.label}</p>
          <div className="flex flex-col gap-px">
            {group.items.map((item) => (
              <SubDepartmentNavLink
                key={item.href}
                item={item}
                active={isActiveHref(activeHref, item.href)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SubDepartmentMobileNav({
  name,
  title,
  activeHref,
}: {
  name: string;
  title: string;
  activeHref: string;
}) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const nav = getSubDepartmentNav(name);
  const allItems = nav.flatMap((g) => g.items);
  const activeItem =
    allItems.find((item) => isActiveHref(activeHref, item.href)) ?? allItems[0];

  return (
    <div className="flex items-center gap-2 border-b border-sts-card-border bg-sts-settings-subnav px-4 py-3 lg:hidden">
      <Link
        href={tenantHref("/sub-departments")}
        aria-label="Back to sub-departments"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sts-card-border text-sts-muted hover:text-sts-foreground"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <Select
        value={activeItem?.href}
        onValueChange={(href) => {
          if (href) router.push(tenantHref(href));
        }}
      >
        <SelectTrigger className="h-9 w-full font-sans text-[13px]">
          <SelectValue>{activeItem?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {nav.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel className="font-sans text-[11.5px] tracking-[1px] text-sts-subtle">
                {title}
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

export function SubDepartmentLayout({
  children,
  name,
  title,
  subtitle,
  navColors = SETTINGS_NAV_COLOR_DEFAULTS,
}: {
  children: React.ReactNode;
  name: string;
  title: string;
  subtitle?: string;
  /** Settings sub-nav accents (tenant Branding page), shared with this sidebar. */
  navColors?: SettingsNavColors;
}) {
  const pathname = useAppPathname();

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 w-full flex-col overflow-hidden lg:flex-row">
      <SubDepartmentMobileNav name={name} title={title} activeHref={pathname} />
      <SubDepartmentSubNav
        name={name}
        title={title}
        subtitle={subtitle}
        activeHref={pathname}
        navColors={navColors}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
