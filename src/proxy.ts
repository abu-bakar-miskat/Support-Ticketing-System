import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  TENANT_SLUG_COOKIE,
  DEPT_SLUG_COOKIE,
  SUBDEPT_SLUG_COOKIE,
  TENANT_SCOPED_ROOTS,
  X_TENANT_SLUG_HEADER,
  X_DEPARTMENT_SLUG_HEADER,
  X_SUBDEPARTMENT_SLUG_HEADER,
  isBareTenantScoped,
  isDeptScopedPath,
  isSubDeptScopedPath,
  parseTenantPathContext,
  tenantWithMissingDepartment,
  type TenantPathContext,
} from "@/lib/tenant-path";
import { PUBLIC_INTAKE_FORM_RE } from "@/lib/support-form-path";

/** Copy any refreshed Supabase auth cookies from `from` onto `to`. */
function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) to.cookies.set(c);
  return to;
}

/** Only trust a referrer from this application when deriving API context. */
function contextFromSameOriginReferrer(request: NextRequest): TenantPathContext | null {
  const referrer = request.headers.get("referer");
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.origin !== request.nextUrl.origin) return null;
    return parseTenantPathContext(url.pathname);
  } catch {
    return null;
  }
}

/** Forward only server-derived scope headers. Incoming values are overwritten
 * so callers cannot smuggle an unvalidated tenant context through the proxy. */
function requestHeadersWithContext(
  request: NextRequest,
  context: TenantPathContext,
): Headers {
  const headers = new Headers(request.headers);
  headers.set(X_TENANT_SLUG_HEADER, context.tenantSlug);
  if (context.departmentSlug) headers.set(X_DEPARTMENT_SLUG_HEADER, context.departmentSlug);
  else headers.delete(X_DEPARTMENT_SLUG_HEADER);
  if (context.subDepartmentSlug) {
    headers.set(X_SUBDEPARTMENT_SLUG_HEADER, context.subDepartmentSlug);
  } else {
    headers.delete(X_SUBDEPARTMENT_SLUG_HEADER);
  }
  return headers;
}

export async function proxy(request: NextRequest) {
  // DEV-ONLY auth bypass for building/designing the app without a live login.
  // Enabled via DEV_AUTH_BYPASS=true (never set this in production). When on,
  // skip the session check + /login redirect entirely; getProfile() returns a
  // synthetic admin so pages render.
  if (process.env.DEV_AUTH_BYPASS === "true") {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verify the session JWT locally against the project's public signing keys
  // (ES256) — no network round trip to Supabase Auth on the hot path.
  const { data } = await supabase.auth.getClaims();
  // Only truthiness matters downstream (authenticated vs not), so widen the type
  // to accept either the local claims payload or a refreshed User (below).
  let user: object | null = data?.claims ?? null;

  // getClaims() verifies the JWT LOCALLY and does NOT refresh an expired token
  // (with asymmetric signing keys there's no network call at all). So once the
  // access token hits its ~1h TTL, local verification yields no claims even
  // though the refresh token is still valid — which previously logged the user
  // out ("session is no longer valid"). When claims are absent, attempt a real
  // refresh via getUser(): it contacts Auth and, if the refresh token is good,
  // rotates the session. The server client's setAll writes the rotated cookies
  // onto supabaseResponse (and request), so downstream getProfile() in this same
  // request sees the fresh token. This network call happens at most ~once per
  // token lifetime, keeping navigations local-verify-only.
  if (!user) {
    const { data: refreshed } = await supabase.auth.getUser();
    user = refreshed.user ?? null;
  }

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/invite/") || // department invite links — page sends the OTP itself, pre-auth
    pathname.startsWith("/tenant-invite/") || // tenant invite links — same, and the page names the invited email/role
    PUBLIC_INTAKE_FORM_RE.test(pathname) || // public intake form: /<tenant>/<dept>/<form-uuid> (+ legacy 4-seg)
    pathname.startsWith("/support/") || // public intake support pages (e.g. /support/verify/<token>)
    pathname.startsWith("/api/support/") || // public intake submissions
    pathname === "/api/intake/upload" || // attachments on public intake forms
    pathname.startsWith("/screen/") || // candidate video screening — the invite token is the auth
    pathname === "/api/screening/upload-url" || // candidate screening APIs, token-authed in the route
    pathname === "/api/screening/answer" ||
    pathname === "/api/screening/submit" ||
    pathname === "/api/screening/score" || // guarded by shared secret (or admin session) in the route
    pathname.startsWith("/api/auth/verify-otp") || // OTP sign-in; no session yet
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") || // authenticated by HMAC signature, not session
    pathname.startsWith("/api/cron/") || // cron jobs — authenticated by Bearer CRON_SECRET in the route, not session
    pathname.startsWith("/api/mcp/") || // authenticated by API key in the path, not session
    pathname === "/offline" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const returnTo = `${pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    if (returnTo && returnTo !== "/" && returnTo !== "/login") {
      url.searchParams.set("next", returnTo);
    }
    return NextResponse.redirect(url);
  }

  // A tenant slug in the URL is request-authoritative. Cookies are shared by all
  // tabs, while the URL is not: /tenant-x/... must continue to mean tenant X
  // after another tab enters tenant Y. Forward the URL context to Server
  // Components and rewrite only the cosmetic prefix away.
  if (user && !isPublic) {
    // A department-scoped route must name its department in the URL. Do not
    // infer it from browser-wide cookies: they can be stale or changed by a
    // different tab, causing the same URL to render different departments.
    const incompleteTenantSlug = tenantWithMissingDepartment(pathname);
    if (incompleteTenantSlug) {
      const url = request.nextUrl.clone();
      url.pathname = `/${incompleteTenantSlug}/departments`;
      return carryCookies(supabaseResponse, NextResponse.redirect(url));
    }

    const urlContext = parseTenantPathContext(pathname);
    if (urlContext) {
      const url = request.nextUrl.clone();
      // A tenant root is an overview, never an implicit department workspace.
      // Keeping the two meanings separate removes the cookie-dependent
      // /<tenant> → dashboard/platform ambiguity.
      if (urlContext.internalPath === "/" && !urlContext.departmentSlug) {
        url.pathname = `/${urlContext.tenantSlug}/departments`;
        return carryCookies(supabaseResponse, NextResponse.redirect(url));
      }
      url.pathname = urlContext.internalPath;
      const headers = requestHeadersWithContext(request, urlContext);
      return carryCookies(
        supabaseResponse,
        NextResponse.rewrite(url, { request: { headers } }),
      );
    }

    // Tenant-scoped API requests have no slug in their own URL. Same-origin
    // browser fetches include the page URL as Referer, which preserves the tab's
    // tenant context. Authorization still validates membership server-side.
    if (pathname.startsWith("/api/")) {
      const referrerContext = contextFromSameOriginReferrer(request);
      if (referrerContext) {
        const headers = requestHeadersWithContext(request, referrerContext);
        return carryCookies(
          supabaseResponse,
          NextResponse.next({ request: { headers } }),
        );
      }
    }

    // Legacy/bare scoped URLs have no request-local tenant. Keep the cookie as
    // a fallback solely to redirect them to a canonical tenant-prefixed URL.
    const tSlug = request.cookies.get(TENANT_SLUG_COOKIE)?.value || "";
    const dSlug = request.cookies.get(DEPT_SLUG_COOKIE)?.value || "";
    const sSlug = request.cookies.get(SUBDEPT_SLUG_COOKIE)?.value || "";
    if (tSlug) {
      const segs = pathname.split("/").filter(Boolean);
      const startsWithTenant = segs[0] === tSlug;
      if (startsWithTenant || isBareTenantScoped(pathname)) {
        // The internal path is everything after the leading slug segments — those
        // are the tenant/dept/subdept slugs (any segment that isn't a known root).
        let i = 0;
        while (i < segs.length && !TENANT_SCOPED_ROOTS.has(segs[i]!)) i++;
        const rest = segs.slice(i).join("/");
        const internal = rest === "" ? "/" : `/${rest}`;

        // Canonical prefix for this internal path from the active cookies:
        //   tenant-level pages → /<tenant>
        //   department-scoped  → /<tenant>/<dept>[/<subdept>]
        let prefix = `/${tSlug}`;
        if (isDeptScopedPath(internal)) {
          if (dSlug) prefix += `/${dSlug}`;
          // Sub-dept segment only for board-like routes — not settings, etc.
          // Skip it when the sub-dept slug collides with the tenant/dept slug,
          // otherwise the URL reads like the tenant name repeating
          // (e.g. /vcad/ui-ux/vcad/modules). The slug is cosmetic — data scope
          // comes from the active-team cookie — so omitting it is safe.
          if (
            dSlug &&
            sSlug &&
            sSlug !== tSlug &&
            sSlug !== dSlug &&
            isSubDeptScopedPath(internal)
          )
            prefix += `/${sSlug}`;
        }
        const target = internal === "/" ? prefix : `${prefix}${internal}`;

        const url = request.nextUrl.clone();
        if (pathname === target) {
          // Already canonical → serve the internal route.
          url.pathname = internal;
          return carryCookies(supabaseResponse, NextResponse.rewrite(url, { request }));
        }
        // Not canonical (bare, or missing/extra slug segments) → redirect.
        url.pathname = target;
        return carryCookies(supabaseResponse, NextResponse.redirect(url));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|manifest\\.json|offline|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
