import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/lib/invites/accept-department-invite";
import { PenLogo } from "@/components/auth/sts-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AutoAcceptInvite } from "@/components/auth/auto-accept-tenant-invite";
import { SubmitButton } from "@/components/auth/submit-button";
import { sendInviteLoginCode } from "@/lib/auth/invite-code-action";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invitation — Global Support Portal" };

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

const ERROR_COPY: Record<string, string> = {
  not_found: "This invitation link is invalid.",
  expired: "This invitation has expired. Ask your manager to send a new one.",
  revoked: "This invitation has been revoked.",
  already_accepted: "This invitation has already been accepted.",
  email_mismatch:
    "You're signed in with a different email than this invitation was sent to. Sign out and use the invited Microsoft account.",
};

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="sts-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans px-4">
      <ThemeToggle className="absolute right-6 top-6 z-20" />
      <div
        className={cn(
          "relative z-10 flex w-full max-w-md flex-col items-center",
          "sts-glass-panel rounded-2xl border px-8 pb-8 pt-10 ring-1 ring-white/40 dark:ring-white/10",
        )}
      >
        <PenLogo />
        <div className="h-6" />
        {children}
      </div>
    </main>
  );
}

export default async function InvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { error: errorCode } = await searchParams;
  const invite = await getInvitePreview(token);

  if (!invite) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Invitation not found
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          This invitation link is invalid or no longer available.
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-sts-blue hover:underline"
        >
          Go to sign in
        </Link>
      </InviteShell>
    );
  }

  if (errorCode && ERROR_COPY[errorCode]) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Could not accept invitation
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          {ERROR_COPY[errorCode]}
        </p>
        {errorCode === "email_mismatch" && (
          <p className="mt-3 text-center text-[12px] text-sts-subtle">
            Invitation was sent to {invite.email}.
          </p>
        )}
        <Link
          href="/"
          className="mt-6 text-[13px] font-medium text-sts-blue hover:underline"
        >
          Go to dashboard
        </Link>
      </InviteShell>
    );
  }

  if (invite.revokedAt) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Invitation revoked
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          This invitation to {invite.department.name} has been revoked.
        </p>
      </InviteShell>
    );
  }

  if (invite.acceptedAt) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Already accepted
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          This invitation has already been used. Sign in to open your dashboard.
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-sts-blue hover:underline"
        >
          Go to sign in
        </Link>
      </InviteShell>
    );
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          Invitation expired
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          Ask your manager to send a new invitation to join {invite.department.name}.
        </p>
      </InviteShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The invite already tells us the recipient's email, so we don't ask them
    // to type it again — but sending the sign-in code MUST be a deliberate click,
    // not a side effect of this GET. Mail-security scanners and link prefetchers
    // fetch the invite URL automatically the moment it arrives; auto-sending here
    // handed those bots an OTP before the human ever clicked, so the invitee saw
    // a stray sign-in code instead of their invitation. The button below sends
    // the code (bots don't submit forms), then lands on code entry.
    const email = invite.email.trim().toLowerCase();
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          You&apos;re invited
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          Join{" "}
          <span className="font-medium text-sts-foreground">{invite.department.name}</span>{" "}
          as{" "}
          <span className="font-medium text-sts-foreground">{invite.role}</span>.
        </p>
        <p className="mt-1 text-center text-[12px] text-sts-subtle">
          Invitation sent to {invite.email}.
        </p>
        <form action={sendInviteLoginCode} className="mt-6 w-full">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={`/invite/${token}`} />
          <SubmitButton
            pendingLabel="Sending code…"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sts-blue px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
          >
            Accept invitation
          </SubmitButton>
        </form>
        <p className="mt-3 text-center text-[12px] text-sts-subtle">
          We&apos;ll email you a one-time sign-in code to continue.
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <AutoAcceptInvite
        acceptUrl={`/api/invites/${encodeURIComponent(token)}/accept`}
      />
    </InviteShell>
  );
}
