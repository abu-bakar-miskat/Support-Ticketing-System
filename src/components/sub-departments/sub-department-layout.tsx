"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    </Link>
  );
}

function SubDepartmentSubNav({
  name,
  title,
  subtitle,
  activeHref,
}: {
  name: string;
  title: string;
  subtitle?: string;
  activeHref: string;
}) {
  const nav = getSubDepartmentNav(name);
  return (
    <nav
      aria-label="Sub-department"
      className="hidden w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-pen-card-border bg-pen-settings-subnav px-[18px] pt-[22px] pb-[18px] lg:flex lg:self-stretch"
    >
      <Link
        href="/sub-departments"
        className="flex items-center gap-1 font-sans text-[11.5px] font-medium text-pen-muted transition-colors hover:text-pen-foreground"
      >
        <ArrowLeft className="size-3" />
        Sub-departments
      </Link>
      <div className="h-2" />
      <p className="truncate font-sans text-base font-semibold text-pen-foreground">
        {title}
      </p>
      {subtitle && (
        <p className="truncate font-sans text-[11.5px] text-pen-subtle">{subtitle}</p>
      )}
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
  const nav = getSubDepartmentNav(name);
  const allItems = nav.flatMap((g) => g.items);
  const activeItem =
    allItems.find((item) => isActiveHref(activeHref, item.href)) ?? allItems[0];

  return (
    <div className="flex items-center gap-2 border-b border-pen-card-border bg-pen-settings-subnav px-4 py-3 lg:hidden">
      <Link
        href="/sub-departments"
        aria-label="Back to sub-departments"
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-pen-card-border text-pen-muted hover:text-pen-foreground"
      >
        <ArrowLeft className="size-4" />
      </Link>
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
}: {
  children: React.ReactNode;
  name: string;
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 w-full flex-col overflow-hidden lg:flex-row">
      <SubDepartmentMobileNav name={name} title={title} activeHref={pathname} />
      <SubDepartmentSubNav
        name={name}
        title={title}
        subtitle={subtitle}
        activeHref={pathname}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
