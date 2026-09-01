"use client";

import { usePathname } from "next/navigation";
import { TENANT_SCOPED_ROOTS, firstSegment, isDeptScopedRoot } from "@/lib/tenant-path";

/**
 * The active tenant/department slugs, read straight from the current URL (the
 * middleware already prefixes it). SSR-safe and cookie-free. Empty strings when
 * the URL isn't prefixed (feature dormant) — links then stay bare and the
 * middleware redirect handles them.
 */
export function useTenantPrefix(): { tenantSlug: string; deptSlug: string } {
  const raw = usePathname();
  const segs = raw.split("/").filter(Boolean);
  const s0 = segs[0] ?? "";
  const tenantSlug = s0 && !TENANT_SCOPED_ROOTS.has(s0) ? s0 : "";
  const s1 = segs[1] ?? "";
  const deptSlug = tenantSlug && s1 && !TENANT_SCOPED_ROOTS.has(s1) ? s1 : "";
  return { tenantSlug, deptSlug };
}

/**
 * Returns a function that prefixes an internal path (/board) with the active
 * tenant (and department, for department-scoped roots) so nav links go straight
 * to /<tenant>/<dept>/board — no middleware redirect hop. A no-op when the URL
 * isn't yet prefixed.
 */
export function useTenantHref(): (internalPath: string) => string {
  const { tenantSlug, deptSlug } = useTenantPrefix();
  return (internalPath: string) => {
    if (!tenantSlug || !internalPath.startsWith("/")) return internalPath;
    const root = firstSegment(internalPath);
    // Only prefix tenant-scoped internal paths (leave /platform, /login, etc.).
    if (internalPath !== "/" && !TENANT_SCOPED_ROOTS.has(root)) return internalPath;
    const base =
      deptSlug && isDeptScopedRoot(root) ? `/${tenantSlug}/${deptSlug}` : `/${tenantSlug}`;
    return internalPath === "/" ? base : `${base}${internalPath}`;
  };
}
