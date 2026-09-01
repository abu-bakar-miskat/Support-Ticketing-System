"use client";

import { usePathname } from "next/navigation";
import { TENANT_SCOPED_ROOTS, firstSegment } from "@/lib/tenant-path";

/**
 * usePathname with the tenant slug prefix removed, so active-nav logic in
 * tenant-scoped components keeps working when the URL is /<slug>/board etc.
 *
 * Cookie-free and SSR-safe: an internal tenant route always begins with a known
 * root (board, settings, …), so when the first segment is NOT one of those it's
 * the tenant slug and gets stripped. On bare (un-prefixed) paths it's a no-op.
 *
 * Only use this inside tenant-scoped UI. Tenant-agnostic areas (e.g. /platform)
 * must keep the raw usePathname().
 */
export function useAppPathname(): string {
  const pathname = usePathname();
  // Strip leading tenant AND department slug segments — anything that isn't a
  // known internal root — until we reach the first known root (board, settings,
  // departments, …). Handles /<tenant>/board and /<tenant>/<dept>/board alike.
  let p = pathname;
  for (;;) {
    const seg = firstSegment(p);
    if (!seg || TENANT_SCOPED_ROOTS.has(seg)) break;
    p = p.slice(seg.length + 1) || "/";
  }
  return p;
}
