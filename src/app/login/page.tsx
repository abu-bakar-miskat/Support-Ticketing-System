import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PenLogo } from "@/components/auth/sts-logo";
import { SubmitButton } from "@/components/auth/submit-button";
import { OtpVerifyForm } from "@/components/auth/otp-verify-form";
import { ResendCodeButton } from "@/components/auth/resend-code-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { sendLoginCode } from "@/lib/auth/send-login-code";
import { isDevTestAccount } from "@/lib/auth/dev-test-accounts";

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

function nextQueryPart(next: string) {
  return next !== "/" ? `&next=${encodeURIComponent(next)}` : "";
}

/** Email the user a one-time sign-in code (OTP). No magic link is issued. */
async function requestLoginCode(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const nextQuery = nextQueryPart(next);

  if (!email) {
    redirect(
      `/login?error=${encodeURIComponent("Enter your email address")}${nextQuery}`,
    );
  }

  // Fixed test accounts sign in with the bypass code (12345678), so there is no
  // real code to email. Skip the send entirely and jump straight to code entry —
  // otherwise a bounced/rate-limited email to a fake test address would strand
  // the request step with an error.
  if (isDevTestAccount(email)) {
    redirect(
      `/login?step=sent&email=${encodeURIComponent(email)}&verificationType=magiclink&t=${Date.now()}${nextQuery}`,
    );
  }

  // A pending invite (accepted or not) must be accepted before a normal
  // sign-in — send the user to the invite's own preview/accept page rather
  // than letting them straight into a sign-in that silently grants it. This
  // applies whether or not they already have a Profile (e.g. an existing
  // member invited to a second department).
  const now = new Date();
  const [tenantInvite, departmentInvite, superAdminInvite] = await Promise.all([
    prisma.tenantInvite.findFirst({
      where: { email, revokedAt: null, acceptedAt: null, expiresAt: { gt: now } },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.departmentInvite.findFirst({
      where: { email, revokedAt: null, acceptedAt: null, expiresAt: { gt: now } },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.superAdminInvite.findFirst({
      where: { email, revokedAt: null, acceptedAt: null, expiresAt: { gt: now } },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (tenantInvite && next !== `/tenant-invite/${tenantInvite.token}`) {
    redirect(`/tenant-invite/${tenantInvite.token}`);
  }
  if (departmentInvite && next !== `/invite/${departmentInvite.token}`) {
    redirect(`/invite/${departmentInvite.token}`);
  }
  if (superAdminInvite && next !== `/super-admin-invite/${superAdminInvite.token}`) {
    redirect(`/super-admin-invite/${superAdminInvite.token}`);
  }

  // No sign-in code for an email with no workspace account and no pending
  // invite either — surface an invitation prompt instead of letting Supabase
  // silently create a new auth user with no matching Profile.
  if (!tenantInvite && !departmentInvite && !superAdminInvite) {
    const profile = await prisma.profile.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!profile) {
      redirect(`/login?notice=no-account&email=${encodeURIComponent(email)}${nextQuery}`);
    }
  }

  // Generate the credential with Supabase, but send the numeric OTP ourselves.
  // A hosted Supabase template can otherwise silently turn signInWithOtp into
  // a magic-link email when it contains {{ .ConfirmationURL }}.
  const result = await sendLoginCode(email);

  if (result.error) {
    redirect(`/login?error=${encodeURIComponent(result.error)}${nextQuery}`);
  }

  // `t` is the send time — the resend countdown reads it so the 90s cooldown
  // survives a refresh and restarts on each fresh send.
  redirect(`/login?step=sent&email=${encodeURIComponent(email)}&verificationType=${result.verificationType}&t=${Date.now()}${nextQuery}`);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    next?: string;
    step?: string;
    email?: string;
    verificationType?: string;
    t?: string;
    notice?: string;
  }>;
}) {
  const {
    error,
    next: nextParam,
    step,
    email: emailParam,
    verificationType: verificationTypeParam,
    t: sentAtParam,
    notice,
  } = await searchParams;
  const next = safeNextPath(nextParam);
  const paramEmail = (emailParam ?? "").trim();
  const verificationType = verificationTypeParam === "signup" ? "signup" : "magiclink";
  const sentStep = step === "sent" && paramEmail.length > 0;
  const noAccountStep = notice === "no-account" && paramEmail.length > 0;
  const backToLoginHref = `/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
  // Send time for the resend countdown; falls back to "now" so a code reached
  // this step even without the marker still starts a full 90s cooldown.
  const sentAt = Number(sentAtParam);
  const codeSentAt = Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now();

  // Redirect already-authenticated users to the dashboard (or invite next).
  // Skip this on the OTP step: verifyOtpCode has just set the session and
  // returned { redirectTo }, and the client hard-navigates there. Re-running
  // this RSC after the action would redirect(next) back to the invite page,
  // which races that navigation and leaves the invitee on "Accepting…" while
  // a second accept request hangs behind the dashboard they never reach.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !sentStep) {
    await redirectSuperAdminToPlatform(user.id, next);
    redirect(next);
  }

  return (
    <main className="sts-ambient-bg relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-20 font-sans sm:px-8">
      {/* Quiet structure and light keep the sign-in surface connected to the app. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--sts-accent) 5%, transparent) 0%, color-mix(in srgb, var(--sts-card) 55%, transparent) 45%, color-mix(in srgb, var(--sts-blue) 4%, transparent) 100%), radial-gradient(70% 60% at 0% 0%, color-mix(in srgb, var(--sts-accent) 4%, transparent) 0%, transparent 72%), radial-gradient(64% 56% at 100% 100%, color-mix(in srgb, var(--sts-blue) 3%, transparent) 0%, transparent 74%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.32] dark:opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--sts-foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--sts-foreground) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 78%)",
        }}
      />

      <ThemeToggle className="absolute right-5 top-5 z-20 shadow-sm sm:right-8 sm:top-8" />

      <div
        className={cn(
          "relative z-10 flex w-full max-w-[30rem] flex-col items-center overflow-hidden",
          "sts-glass-panel sts-modal-enter rounded-[1.375rem] border px-6 pb-8 pt-9 sm:px-10 sm:pb-10 sm:pt-11",
          "ring-1 ring-white/50 dark:ring-white/[0.07]",
          "shadow-[0_3px_10px_-4px_rgba(16,35,52,0.12),0_32px_70px_-28px_rgba(16,35,52,0.3)] dark:shadow-[0_32px_80px_-28px_rgba(0,0,0,0.55)]",
        )}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-sts-accent/45 to-transparent"
        />

        <div className="rounded-2xl bg-sts-surface/80 px-5 py-3.5 ring-1 ring-sts-card-border/70 [&_img]:h-28">
          <PenLogo />
        </div>

        <div className="h-7 sm:h-8" />

        {sentStep && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sts-accent">
            Code sent
          </p>
        )}

        <h1
          className={cn(
            "text-center font-semibold leading-[1.12] tracking-[-0.025em] text-sts-foreground",
            sentStep || noAccountStep
              ? "text-[28px] text-balance sm:text-[30px]"
              : "whitespace-nowrap text-[clamp(1.4rem,7vw,1.875rem)]",
          )}
        >
          {noAccountStep
            ? "No account found"
            : sentStep
              ? "Check your inbox"
              : "Sign in to your workspace"}
        </h1>

        <div className="h-2.5" />

        <p
          className={cn(
            "max-w-[20rem] text-center text-[13.5px] leading-relaxed text-pretty text-sts-muted",
          )}
        >
          {noAccountStep ? (
            <>
              We couldn&apos;t find a workspace account for{" "}
              <span className="font-medium text-sts-foreground">{paramEmail}</span>
            </>
          ) : sentStep ? (
            `We emailed a sign-in code to ${paramEmail}`
          ) : (
            "Enter your work email and we’ll send you a secure, password-free sign-in code."
          )}
        </p>

        <div className="h-7 sm:h-8" />

        {error && (
          <div
            role="alert"
            className="mb-5 w-full rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-left text-[13px] leading-relaxed text-destructive"
          >
            {decodeURIComponent(error)}
          </div>
        )}

        {sentStep ? (
          <>
            <div className="flex w-full flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-sts-accent/10 text-sts-accent ring-1 ring-sts-accent/15">
                <MailIcon />
              </div>

              <div className="h-5" />

              <p className="max-w-[19rem] text-[13.5px] leading-relaxed text-sts-muted">
                Enter the code from the email to finish signing in. The code
                stays valid for a few minutes.
              </p>
            </div>

            <div className="h-6" />

            <OtpVerifyForm email={paramEmail} next={next} verificationType={verificationType} />

            <div className="h-6" />

            <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12.5px]">
              <ResendCodeButton
                email={paramEmail}
                next={next}
                verificationType={verificationType}
                sentAt={codeSentAt}
                resendAction={requestLoginCode}
              />
              <span className="text-sts-card-border" aria-hidden>
                |
              </span>
              <a
                href={backToLoginHref}
                className="rounded-sm text-sts-muted underline-offset-4 transition-colors hover:text-sts-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60"
              >
                Use a different email
              </a>
            </div>
          </>
        ) : noAccountStep ? (
          <>
            <div className="flex w-full flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/15">
                <UserXIcon />
              </div>

              <div className="h-5" />

              <p className="max-w-[19rem] text-[13.5px] leading-relaxed text-sts-muted">
                Ask your department or tenant admin to invite you, then try
                signing in again.
              </p>
            </div>

            <div className="h-6" />

            <a
              href={backToLoginHref}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
                "border border-sts-card-border bg-sts-card text-[14px] font-semibold text-sts-foreground shadow-sm",
                "sts-pressable transition-[background-color,transform,box-shadow] duration-200 hover:border-sts-subtle/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-card",
              )}
            >
              <BackArrowIcon />
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <form action={requestLoginCode} className="w-full space-y-4">
              {next !== "/" && <input type="hidden" name="next" value={next} />}
              <label className="flex w-full flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-sts-foreground">
                  Work email
                </span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="name@company.com"
                  autoComplete="email"
                  autoFocus
                  className={cn(
                    "h-12 w-full rounded-xl border border-sts-card-border bg-sts-card px-4 text-[14px] text-sts-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]",
                    "placeholder:text-sts-subtle",
                    "transition-[border-color,box-shadow] duration-200 hover:border-sts-subtle/70 focus-visible:border-sts-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sts-accent/20",
                  )}
                />
              </label>
              <SubmitButton
                pendingLabel="Sending code…"
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
                  "bg-sts-button text-[14px] font-semibold text-sts-button-fg shadow-sm",
                  "sts-pressable transition-[background-color,transform,box-shadow] duration-200 hover:bg-sts-button/90 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-card",
                )}
              >
                Email me a sign-in code
                <ArrowIcon />
              </SubmitButton>
            </form>

            <div className="h-5" />

            <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-normal text-sts-subtle">
              <LockIcon />
              Your sign-in code expires after a few minutes.
            </p>
          </>
        )}

      </div>
    </main>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="16" height="11" x="4" y="11" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
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

function BackArrowIcon() {
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
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function UserXIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 8 4 4" />
      <path d="m21 8-4 4" />
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
