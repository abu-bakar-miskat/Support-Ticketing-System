import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PenLogo } from "@/components/auth/sts-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/auth-redirect";
import { completeLogin } from "@/lib/auth/complete-login";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

/**
 * Super-admins land on the platform console on login (mirrors /auth/callback).
 * Clears any stale active-dept cookie so they don't drop into a dept dashboard.
 * Only applies to the default landing ("/"); a real deep link still wins.
 */
async function redirectSuperAdminToPlatform(
  userId: string,
  next: string,
): Promise<void> {
  if (next !== "/") return;
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (!profile?.isSuperAdmin) return;
  const cookieStore = await cookies();
  cookieStore.set("pen_active_dept", "", { path: "/", maxAge: 0 });
  redirect("/platform");
}

async function getOrigin() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

function nextQueryPart(next: string) {
  return next !== "/" ? `&next=${encodeURIComponent(next)}` : "";
}

async function signInWithMicrosoft(formData: FormData) {
  "use server";
  const origin = await getOrigin();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const cookieStore = await cookies();
  if (next !== "/") {
    cookieStore.set("pen_auth_next", next, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 10,
      sameSite: "lax",
    });
  } else {
    cookieStore.set("pen_auth_next", "", { path: "/", maxAge: 0 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "email profile",
      redirectTo:
        next === "/"
          ? `${origin}/auth/callback`
          : `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

/** Step 1 — email the user a 6-digit sign-in code. */
async function requestOtp(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const nextQuery = nextQueryPart(next);

  if (!email) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email address")}${nextQuery}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${nextQuery}`);
  }

  redirect(
    `/login?step=otp&email=${encodeURIComponent(email)}${nextQuery}`,
  );
}

/** Step 2 — verify the 6-digit code and complete the login. */
async function verifyOtp(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const nextQuery = nextQueryPart(next);
  const otpQuery = `&step=otp&email=${encodeURIComponent(email)}${nextQuery}`;

  if (!email) {
    redirect(`/login?error=${encodeURIComponent("Enter your email address")}${nextQuery}`);
  }
  if (!/^\d{8}$/.test(token)) {
    redirect(`/login?error=${encodeURIComponent("Enter the 8-digit code from your email")}${otpQuery}`);
  }

  const supabase = await createClient();

  // Dev-only backdoor: entering the fixed code below signs the user in without a
  // real emailed OTP. We mint a genuine Supabase session via the admin client so
  // the rest of the login flow behaves exactly as it does in production. This is
  // hard-gated to non-production builds and must never run in prod.
  const DEV_OTP = "12345678";
  let data:
    | Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["data"]
    | undefined;

  if (process.env.NODE_ENV !== "production" && token === DEV_OTP) {
    const admin = createAdminClient();
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      redirect(
        `/login?error=${encodeURIComponent(linkError?.message ?? "Dev sign-in failed (user must exist)")}${otpQuery}`,
      );
    }
    const verified = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (verified.error) {
      redirect(`/login?error=${encodeURIComponent(verified.error.message)}${otpQuery}`);
    }
    data = verified.data;
  } else {
    const verified = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (verified.error) {
      redirect(`/login?error=${encodeURIComponent(verified.error.message)}${otpQuery}`);
    }
    data = verified.data;
  }

  if (data?.user) {
    const { redirectPath, cookies: loginCookies } = await completeLogin({
      supabase,
      user: data.user,
      next,
    });
    const cookieStore = await cookies();
    for (const c of loginCookies) cookieStore.set(c.name, c.value, c.options);
    redirect(redirectPath);
  }

  redirect(next);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
    step?: string;
    email?: string;
  }>;
}) {
  const {
    error,
    next: nextParam,
    step,
    email: emailParam,
  } = await searchParams;
  const next = safeNextPath(nextParam);

  // Redirect already-authenticated users to the dashboard (or invite next)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await redirectSuperAdminToPlatform(user.id, next);
    redirect(next);
  }

  const otpEmail = (emailParam ?? "").trim();
  const otpStep = step === "otp" && otpEmail.length > 0;

  return (
    <main className="sts-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans">
      <ThemeToggle className="absolute right-6 top-6 z-20" />

      <div
        className={cn(
          "relative z-10 flex w-full max-w-100 flex-col items-center",
          "sts-glass-panel sts-modal-enter rounded-2xl border px-10 pb-10 pt-12 ring-1 ring-white/40 dark:ring-white/10",
        )}
      >
        <PenLogo />

        <div className="h-8" />

        <h1 className="sts-text-admin-title text-md text-center leading-snug text-balance">
          Welcome to Support Ticketing System
        </h1>

        <div className="h-2" />

        <p className="text-center text-[13.5px] leading-normal text-sts-muted">
          {otpStep
            ? `Enter the 8-digit code sent to ${otpEmail}`
            : "Sign in with your PEN work account"}
        </p>

        <div className="h-8" />

        {error && (
          <div
            role="alert"
            className="mb-4 w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-[13px] text-destructive"
          >
            {decodeURIComponent(error)}
          </div>
        )}

        {otpStep ? (
          <>
            <form action={verifyOtp} className="w-full space-y-3">
              {next !== "/" && <input type="hidden" name="next" value={next} />}
              <input type="hidden" name="email" value={otpEmail} />
              <div className="flex justify-center py-1">
                <InputOTP
                  name="token"
                  maxLength={8}
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="^\d*$"
                  aria-label="8-digit code"
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-11 w-9 text-[16px]"
                      />
                    ))}
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <InputOTPSlot
                        key={i + 4}
                        index={i + 4}
                        className="h-11 w-9 text-[16px]"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <button
                type="submit"
                className={cn(
                  "flex h-12 w-full items-center justify-center rounded-lg",
                  "bg-sts-button text-[14px] font-medium text-sts-button-fg",
                  "sts-pressable transition-colors hover:bg-sts-button/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60",
                )}
              >
                Verify &amp; sign in
              </button>
            </form>

            <div className="h-4" />

            <div className="flex w-full items-center justify-between text-[12px]">
              <form action={requestOtp}>
                {next !== "/" && (
                  <input type="hidden" name="next" value={next} />
                )}
                <input type="hidden" name="email" value={otpEmail} />
                <button
                  type="submit"
                  className="text-sts-muted underline-offset-4 hover:text-foreground hover:underline"
                >
                  Resend code
                </button>
              </form>
              <a
                href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="text-sts-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                Use a different email
              </a>
            </div>
          </>
        ) : (
          <>
            <form action={signInWithMicrosoft} className="w-full">
              {next !== "/" && <input type="hidden" name="next" value={next} />}
              <button
                type="submit"
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-3 rounded-lg",
                  "bg-sts-button text-[14px] font-medium text-sts-button-fg",
                  "sts-pressable transition-colors hover:bg-sts-button/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60",
                )}
              >
                <MicrosoftLogo />
                Sign in with Microsoft
              </button>
            </form>

            <div className="h-6" />

            <div className="flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11.5px] text-sts-muted">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="h-6" />

            <form action={requestOtp} className="w-full space-y-3">
              {next !== "/" && <input type="hidden" name="next" value={next} />}
              <input
                type="email"
                name="email"
                required
                placeholder="Email"
                autoComplete="email"
                className={cn(
                  "h-11 w-full rounded-lg border bg-transparent px-3.5 text-[13.5px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60",
                )}
              />
              <button
                type="submit"
                className={cn(
                  "flex h-11 w-full items-center justify-center rounded-lg border",
                  "text-[13.5px] font-medium",
                  "sts-pressable transition-colors hover:bg-sts-button/10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60",
                )}
              >
                Email me a code
              </button>
            </form>
          </>
        )}

        <div className="h-8" />

        <div className="flex items-center justify-center gap-1.5">
          <span
            className="size-1.25 shrink-0 rounded-full bg-sts-accent"
            aria-hidden
          />
          <p className="text-[11.5px] text-sts-muted">
            Restricted to PEN organization
          </p>
        </div>
      </div>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="0" y="0" width="7" height="7" fill="#f25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7fba00" />
      <rect x="0" y="9" width="7" height="7" fill="#00a4ef" />
      <rect x="9" y="9" width="7" height="7" fill="#ffb900" />
    </svg>
  );
}
