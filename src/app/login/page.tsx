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
    redirect(`/login?error=${encodeURIComponent(result.error)}&email=${encodeURIComponent(email)}${nextQuery}`);
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
    <main className="relative isolate grid min-h-dvh font-sans lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ── Brand panel (desktop) ─────────────────────────────────────────── */}
      <aside
        className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20"
        style={{
          background:
            "radial-gradient(90% 70% at 0% 0%, var(--sts-accent) 0%, transparent 60%), radial-gradient(80% 70% at 100% 100%, color-mix(in srgb, var(--sts-accent) 55%, #7c2d12) 0%, transparent 65%), linear-gradient(160deg, color-mix(in srgb, var(--sts-accent) 70%, #1c0a04) 0%, #1a0b06 100%)",
        }}
      >
        {/* Fine grid and a soft glow give the panel depth without competing with the copy. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 80% 70% at 30% 40%, black 0%, transparent 75%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-1/3 size-[28rem] rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/support-logo-horizontal-white.png"
            alt="Global Support Portal"
            className="h-11 w-auto brightness-0 invert"
          />
        </div>

        <div className="relative max-w-[30rem]">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Support, simplified
          </p>
          <h2 className="mt-4 text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance">
            Every request, routed and resolved.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/75 text-pretty">
            One workspace for tickets, departments and SLAs, so your teams can
            respond faster and nothing slips through the cracks.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              { title: "Smart routing", body: "Tickets land with the right department automatically." },
              { title: "SLA tracking", body: "Response and resolution targets, visible at a glance." },
              { title: "Password-free security", body: "One-time codes keep every sign-in safe." },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                  <CheckIcon />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-white/70">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-white/55">
          &copy; {new Date().getFullYear()} Global Support Portal
        </p>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-dvh flex-col bg-sts-bg px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          {/* Logo only on mobile — the brand panel carries it on desktop. */}
          <PenLogo className="lg:invisible [&_img]:h-12" />
          <ThemeToggle className="shadow-sm" />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="sts-modal-enter w-full max-w-[27rem]">
            {sentStep && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sts-accent">
                Code sent
              </p>
            )}

            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-sts-foreground text-balance sm:text-[30px]">
              {noAccountStep
                ? "No account found"
                : sentStep
                  ? "Check your inbox"
                  : "Welcome back"}
            </h1>

            <p className="mt-2.5 text-[14px] leading-relaxed text-sts-muted text-pretty">
              {noAccountStep ? (
                <>
                  We couldn&apos;t find a workspace account for{" "}
                  <span className="font-medium text-sts-foreground">{paramEmail}</span>.
                </>
              ) : sentStep ? (
                <>
                  We emailed a sign-in code to{" "}
                  <span className="font-medium text-sts-foreground">{paramEmail}</span>.
                  Enter it below to finish signing in.
                </>
              ) : (
                "Sign in to your workspace with your work email. We’ll send you a secure, one-time code — no password needed."
              )}
            </p>

            <div className="h-8" />

            {error && (
              <div
                role="alert"
                className="mb-5 w-full rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-left text-[13px] leading-relaxed text-destructive"
              >
                {/* searchParams are already decoded — decoding again throws on a literal "%". */}
                {error}
              </div>
            )}

            {sentStep ? (
              <>
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

                <div className="h-6" />

                <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-normal text-sts-subtle">
                  <LockIcon />
                  The code stays valid for a few minutes.
                </p>
              </>
            ) : noAccountStep ? (
              <>
                <div className="flex items-start gap-3.5 rounded-xl border border-sts-card-border bg-sts-card p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <UserXIcon />
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-sts-muted">
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-bg",
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
                    <span className="text-[13px] font-medium text-sts-foreground">
                      Work email
                    </span>
                    <span className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sts-subtle">
                        <AtIcon />
                      </span>
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="name@company.com"
                        autoComplete="email"
                        defaultValue={paramEmail}
                        autoFocus
                        className={cn(
                          "h-12 w-full rounded-xl border border-sts-card-border bg-sts-card pl-11 pr-4 text-[14px] text-sts-foreground shadow-sm",
                          "placeholder:text-sts-subtle",
                          "transition-[border-color,box-shadow] duration-200 hover:border-sts-subtle/70 focus-visible:border-sts-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sts-accent/20",
                        )}
                      />
                    </span>
                  </label>
                  <SubmitButton
                    pendingLabel="Sending code…"
                    className={cn(
                      "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
                      "bg-sts-button text-[14px] font-semibold text-sts-button-fg shadow-sm",
                      "sts-pressable transition-[background-color,transform,box-shadow] duration-200 hover:bg-sts-button/90 hover:shadow-md",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sts-bg",
                    )}
                  >
                    Continue with email
                    <ArrowIcon />
                  </SubmitButton>
                </form>

                <div className="my-7 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-sts-subtle">
                  <span className="h-px flex-1 bg-sts-card-border" />
                  Secure sign-in
                  <span className="h-px flex-1 bg-sts-card-border" />
                </div>

                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-sts-muted">
                  <span className="mt-0.5 text-sts-subtle">
                    <LockIcon />
                  </span>
                  We&apos;ll email you a one-time code that expires after a few
                  minutes. New here? Ask your admin for an invite.
                </p>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[12px] text-sts-subtle lg:hidden">
          &copy; {new Date().getFullYear()} Global Support Portal
        </p>
      </section>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
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
