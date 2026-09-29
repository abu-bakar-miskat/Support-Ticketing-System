"use client";

import { useEffect, useRef } from "react";
import { firstSegment, TENANT_SCOPED_ROOTS } from "@/lib/tenant-path";

/**
 * Keeps the URL tenant slug and the active-tenant cookies aligned.
 *
 * Tenant-prefixed URLs are resolved by the server proxy and are already
 * request-authoritative. The client guard only upgrades legacy bare URLs; it
 * must never rewrite shared cookies from a tenant tab because that would make
 * several open tabs fight over one browser-wide value.
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

      // The proxy has already derived this tab's tenant from the URL.
      if (headIsTenantSlug) return;

      const res = await fetch("/api/active-tenant", {
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

      const rest = segs;
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
