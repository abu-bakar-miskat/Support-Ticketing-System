import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { runVerifyOtp } from "@/lib/auth/verify-otp";
import { runAsSystem } from "@/lib/request-scope";
import type { LoginCookie } from "@/lib/auth/complete-login";

function cookieFromSupabase(
  name: string,
  value: string,
  options: {
    path?: string;
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: string | boolean;
  },
): LoginCookie {
  const sameSite = options.sameSite;
  return {
    name,
    value,
    options: {
      path: options.path ?? "/",
      maxAge: options.maxAge,
      httpOnly: options.httpOnly,
      sameSite:
        sameSite === "lax" || sameSite === "strict" || sameSite === "none"
          ? sameSite
          : "lax",
    },
  };
}

/**
 * OTP verify as a Route Handler so the login form can `fetch` + hard-navigate.
 *
 * The previous server-action path finished on the server (completeLogin
 * returned the dashboard URL) but Next held the action result until it
 * re-rendered `/login` with the new session — which never completed, so the
 * button stayed on "Verifying…". A JSON response is not tied to that RSC
 * refresh.
 */
export async function POST(request: NextRequest) {
  let body: {
    email?: string;
    token?: string;
    next?: string;
    verificationType?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const pending: LoginCookie[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            const cookie = cookieFromSupabase(name, value, options ?? {});
            // Write into next/headers so getProfile() (Prisma scope fallback)
            // can see the new session in this same request. Without this,
            // acceptTenantInvite's subDepartment lookup throws and the OTP
            // is already consumed.
            cookieStore.set(cookie.name, cookie.value, cookie.options);
            pending.push(cookie);
          }
        },
      },
    },
  );

  try {
    const { redirectTo, cookies: loginCookies } = await runAsSystem(() =>
      runVerifyOtp(supabase, {
        email: String(body.email ?? ""),
        token: String(body.token ?? ""),
        next: body.next,
        verificationType: body.verificationType,
      }),
    );

    const res = NextResponse.json({ redirectTo });
    for (const c of [...pending, ...loginCookies]) {
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json(
      { error: "Could not finish signing in. Request a new code and try again." },
      { status: 500 },
    );
  }
}
