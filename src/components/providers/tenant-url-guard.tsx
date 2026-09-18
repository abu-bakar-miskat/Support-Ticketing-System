"use client";

import { useEffect, useRef } from "react";
import { firstSegment, TENANT_SCOPED_ROOTS } from "@/lib/tenant-path";

/**
 * Keeps the URL tenant slug and the active-tenant cookies aligned.
 *
 * When the path is `/nishan/departments` but cookies still point at another
 * org (e.g. VCAD), the URL wins: we switch into `nishan` and reload so the
 * page data matches the link. A plain GET never writes cookies, so a stale
 * heal request cannot overwrite a just-finished Enter.
 */
export function TenantUrlGuard() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;
    (async () => {
      const { pathname, search, hash } = window.location;
      const segs = pathname.split("/").filter(Boolean);
      const head = segs[0] ?? "";
      const headIsTenantSlug = head.length > 0 && !TENANT_SCOPED_ROOTS.has(head);
      const bareScoped =
        pathname === "/" || TENANT_SCOPED_ROOTS.has(firstSegment(pathname));

      // Platform / login / etc. — nothing to sync.
      if (!headIsTenantSlug && !bareScoped) return;

      const qs = headIsTenantSlug
        ? `?urlSlug=${encodeURIComponent(head)}`
        : "";
      const res = await fetch(`/api/active-tenant${qs}`, {
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => null);
      if (cancelled || !res?.ok) return;

      const body = (await res.json().catch(() => null)) as {
        tenant?: { slug: string } | null;
        switched?: boolean;
      } | null;
      const slug = body?.tenant?.slug;
      if (!slug) return;

      // Cookies were switched to match the URL — reload so server components
      // re-read the new active tenant (otherwise the header still shows the
      // previous org under the new slug).
      if (body?.switched) {
        window.location.reload();
        return;
      }

      if (headIsTenantSlug && head === slug) return;

      const rest = headIsTenantSlug ? segs.slice(1) : segs;
      const internal = rest.length === 0 ? "" : `/${rest.join("/")}`;
      const next = `/${slug}${internal}${search}${hash}`;
      if (next !== `${pathname}${search}${hash}`) {
        window.location.replace(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
