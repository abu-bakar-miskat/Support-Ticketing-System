"use client";

import { useEffect, useRef } from "react";
import { firstSegment, TENANT_SCOPED_ROOTS } from "@/lib/tenant-path";

/**
 * Keeps the URL tenant slug aligned with the authoritative active-tenant id
 * cookie. A desync (e.g. /vcad/… while the id cookie points at another org)
 * was showing the wrong tenant name under the wrong URL after Enter.
 *
 * On mount: heal cookies via GET /api/active-tenant, then rewrite the location
 * when the first path segment is a stale slug.
 */
export function TenantUrlGuard() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/active-tenant", { credentials: "same-origin" }).catch(
        () => null,
      );
      if (cancelled || !res?.ok) return;
      const body = (await res.json().catch(() => null)) as {
        tenant?: { slug: string } | null;
      } | null;
      const slug = body?.tenant?.slug;
      if (!slug) return;

      const { pathname, search, hash } = window.location;
      const segs = pathname.split("/").filter(Boolean);
      const head = segs[0] ?? "";
      // Only rewrite when the URL already carries a tenant (or bare scoped)
      // prefix — leave /platform, /login, etc. alone.
      const headIsTenantSlug = head.length > 0 && !TENANT_SCOPED_ROOTS.has(head);
      const bareScoped = pathname === "/" || TENANT_SCOPED_ROOTS.has(firstSegment(pathname));
      if (!headIsTenantSlug && !bareScoped) return;
      if (head === slug) return;

      const rest = headIsTenantSlug ? segs.slice(1) : segs;
      const internal = rest.length === 0 ? "" : `/${rest.join("/")}`;
      const next = `/${slug}${internal}${search}${hash}`;
      if (next !== pathname + search + hash) {
        window.location.replace(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
