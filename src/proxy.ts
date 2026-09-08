import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  TENANT_SLUG_COOKIE,
  DEPT_SLUG_COOKIE,
  SUBDEPT_SLUG_COOKIE,
  TENANT_SCOPED_ROOTS,
  isBareTenantScoped,
  isDeptScopedPath,
  isSubDeptScopedPath,
} from "@/lib/tenant-path";
import { PUBLIC_INTAKE_FORM_RE } from "@/lib/support-form-path";

/** Copy any refreshed Supabase auth cookies from `from` onto `to`. */
function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) to.cookies.set(c);
  return to;
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
    pathname.startsWith("/invite/") || // department invite links — page sends users to login with ?next=
    PUBLIC_INTAKE_FORM_RE.test(pathname) || // public intake form: /<tenant>/<dept>/<subdept>/<form-uuid>
    pathname.startsWith("/support/") || // public intake support pages (e.g. /support/verify/<token>)
    pathname.startsWith("/api/support/") || // public intake submissions
    pathname === "/api/intake/upload" || // attachments on public intake forms
    pathname.startsWith("/screen/") || // candidate video screening — the invite token is the auth
    pathname === "/api/screening/upload-url" || // candidate screening APIs, token-authed in the route
    pathname === "/api/screening/answer" ||
    pathname === "/api/screening/submit" ||
    pathname === "/api/screening/score" || // guarded by shared secret (or admin session) in the route
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/webhooks/") || // authenticated by HMAC signature, not session
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

  // Tenant name in the URL. Fully guarded on the slug cookie so existing sessions
  // (no cookie) behave exactly as before — activates only once the slug cookie is
  // set (login / tenant switch). The tenant-id cookie stays authoritative for
  // data scoping; the slug is cosmetic and always forced to match it.
  if (user && !isPublic) {
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
          if (dSlug && sSlug && isSubDeptScopedPath(internal)) prefix += `/${sSlug}`;
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
