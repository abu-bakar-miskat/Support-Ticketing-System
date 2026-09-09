"use client";

import { usePathname } from "next/navigation";
import { TENANT_SCOPED_ROOTS, firstSegment, isDeptScopedPath, isSubDeptScopedPath } from "@/lib/tenant-path";

/**
 * The active tenant/department slugs, read straight from the current URL (the
 * middleware already prefixes it). SSR-safe and cookie-free. Empty strings when
 * the URL isn't prefixed (feature dormant) — links then stay bare and the
 * middleware redirect handles them.
 */
export function useTenantPrefix(): {
  tenantSlug: string;
  deptSlug: string;
  subDeptSlug: string;
} {
  const raw = usePathname();
  const segs = raw.split("/").filter(Boolean);
  const s0 = segs[0] ?? "";
  const tenantSlug = s0 && !TENANT_SCOPED_ROOTS.has(s0) ? s0 : "";
  const s1 = segs[1] ?? "";
  const deptSlug = tenantSlug && s1 && !TENANT_SCOPED_ROOTS.has(s1) ? s1 : "";
  const s2 = segs[2] ?? "";
  // Only treat s2 as a sub-dept when the rest of the path is sub-dept-scoped
  // (e.g. /tenant/dept/sub/board). For /tenant/dept/settings/…, s2 is "settings".
  const restFrom2 = s2 ? `/${segs.slice(2).join("/")}` : "/";
  const subDeptSlug =
    deptSlug && s2 && !TENANT_SCOPED_ROOTS.has(s2) && isSubDeptScopedPath(restFrom2)
      ? s2
      : "";
  return { tenantSlug, deptSlug, subDeptSlug };
}

/**
 * Returns a function that prefixes an internal path (/board) with the active
 * tenant (and department, for department-scoped roots) so nav links go straight
 * to /<tenant>/<dept>/board — no middleware redirect hop. A no-op when the URL
 * isn't yet prefixed.
 */
export function useTenantHref(): (internalPath: string) => string {
  const { tenantSlug, deptSlug, subDeptSlug } = useTenantPrefix();
  return (internalPath: string) => {
    if (!tenantSlug || !internalPath.startsWith("/")) return internalPath;
    const root = firstSegment(internalPath);
    // Only prefix tenant-scoped internal paths (leave /platform, /login, etc.).
    if (internalPath !== "/" && !TENANT_SCOPED_ROOTS.has(root)) return internalPath;
    let base = `/${tenantSlug}`;
    if (deptSlug && isDeptScopedPath(internalPath)) {
      base += `/${deptSlug}`;
      // Omit the sub-dept slug when it collides with the tenant/dept slug — it
      // would otherwise read like the tenant name repeating in the URL. The
      // slug is cosmetic (data scope comes from the active-team cookie), so the
      // middleware still rewrites the collapsed URL to the right page.
      if (
        subDeptSlug &&
        subDeptSlug !== tenantSlug &&
        subDeptSlug !== deptSlug &&
        isSubDeptScopedPath(internalPath)
      )
        base += `/${subDeptSlug}`;
    }
    return internalPath === "/" ? base : `${base}${internalPath}`;
  };
}
