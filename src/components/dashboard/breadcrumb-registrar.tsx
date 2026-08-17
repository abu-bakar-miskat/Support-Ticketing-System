"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { useBreadcrumbStore, type PageCrumb } from "@/store/use-breadcrumb-store";

/** Registers a page-specific breadcrumb trail in the top bar (cleared on unmount). */
export function BreadcrumbRegistrar({ crumbs }: { crumbs: PageCrumb[] }) {
  const pathname = usePathname();
  const key = crumbs.map((c) => `${c.href}:${c.label}`).join("|");

  useLayoutEffect(() => {
    useBreadcrumbStore.getState().setPageCrumbs(pathname, crumbs);
    return () => {
      useBreadcrumbStore.getState().clearPageCrumbs(pathname);
    };
  }, [pathname, key, crumbs]);

  return null;
}
