import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PenLogo } from "@/components/auth/sts-logo";
import { SubmitButton } from "@/components/auth/submit-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";
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

/** Email the user a one-click magic sign-in link. */
async function requestMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const nextQuery = nextQueryPart(next);

  if (!email) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email address")}${nextQuery}`,
    );
  }

  const origin = await getOrigin();
  const cookieStore = await cookies();
  // Persist `next` for the callback round-trip, mirroring the OAuth flow.
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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo:
        next === "/"
          ? `${origin}/auth/callback`
          : `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${nextQuery}`);
  }

  redirect(`/login?step=sent&email=${encodeURIComponent(email)}${nextQuery}`);
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

  const sentEmail = (emailParam ?? "").trim();
  const sentStep = step === "sent" && sentEmail.length > 0;

  return (
    <main className="sts-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 font-sans">
      {/* Soft accent glow so the card doesn't float on flat grey */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 46% at 50% 0%, color-mix(in srgb, var(--sts-accent) 9%, transparent) 0%, transparent 72%)",
        }}
      />

      <ThemeToggle className="absolute right-6 top-6 z-20" />

      <div
        className={cn(
          "relative z-10 flex w-full max-w-96 flex-col items-center",
          "sts-glass-panel sts-modal-enter rounded-2xl border px-9 pb-9 pt-11 ring-1 ring-white/40 dark:ring-white/10",
          "shadow-[0_2px_8px_-3px_rgba(16,24,40,0.08),0_24px_48px_-16px_rgba(16,24,40,0.16)]",
        )}
      >
        <div className="[&_img]:h-20">
          <PenLogo />
        </div>

        <div className="h-7" />

        {sentStep && (
          <>
            <h1
              className="text-center text-[26px] font-semibold leading-tight tracking-tight text-balance text-sts-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Check your inbox
            </h1>

            <div className="h-2" />
          </>
        )}

        <p
          className={cn(
            "max-w-[17rem] text-center leading-normal text-balance",
            sentStep
              ? "text-[13.5px] text-sts-muted"
              : "text-[15px] font-medium text-sts-foreground",
          )}
        >
          {sentStep
            ? `We emailed a sign-in link to ${sentEmail}`
            : "Sign in to the Support Ticketing System"}
        </p>

        <div className="h-7" />

        {error && (
          <div
            role="alert"
            className="mb-4 w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-[13px] text-destructive"
          >
            {decodeURIComponent(error)}
          </div>
        )}

        {sentStep ? (
          <>
            <div className="flex w-full flex-col items-center text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-sts-accent/10 text-sts-accent">
                <MailIcon />
              </div>

              <div className="h-5" />

              <p className="text-[13.5px] leading-normal text-sts-muted">
                Click the link in the email to finish signing in. It stays valid
                for a few minutes — you can close this tab afterward.
              </p>
            </div>

            <div className="h-6" />

            <div className="flex w-full items-center justify-center gap-4 text-[12.5px]">
              <form action={requestMagicLink}>
                {next !== "/" && (
                  <input type="hidden" name="next" value={next} />
                )}
                <input type="hidden" name="email" value={sentEmail} />
                <button
                  type="submit"
                  className="font-medium text-sts-accent underline-offset-4 hover:underline"
                >
                  Resend link
                </button>
              </form>
              <span className="text-sts-card-border" aria-hidden>
                |
              </span>
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
            <form action={requestMagicLink} className="w-full space-y-4">
              {next !== "/" && <input type="hidden" name="next" value={next} />}
              <label className="flex w-full flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.6px] text-sts-subtle">
                  Work email
                </span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@mail.com"
                  autoComplete="email"
                  className={cn(
                    "h-11 w-full rounded-lg border border-sts-card-border bg-sts-card px-3.5 text-[14px] text-sts-foreground",
                    "placeholder:text-sts-subtle",
                    "transition-colors focus-visible:border-sts-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/50",
                  )}
                />
              </label>
              <SubmitButton
                pendingLabel="Sending link…"
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-lg",
                  "bg-sts-button text-[14px] font-medium text-sts-button-fg",
                  "sts-pressable transition-colors hover:bg-sts-button/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-card",
                )}
              >
                Email me a sign-in link
                <ArrowIcon />
              </SubmitButton>
            </form>

            <div className="h-6" />

            <p className="text-center text-[11.5px] leading-normal text-sts-subtle">
              We&rsquo;ll email you a secure link — no password needed. It
              expires after a few minutes.
            </p>
          </>
        )}

      </div>
    </main>
  );
}

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  );
}
