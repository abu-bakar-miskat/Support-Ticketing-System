import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getInvitePreview } from "@/lib/invites/accept-department-invite";
import { PenLogo } from "@/components/auth/pen-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invitation — Ticketing System" };

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
    <main className="pen-ambient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans px-4">
      <ThemeToggle className="absolute right-6 top-6 z-20" />
      <div
        className={cn(
          "relative z-10 flex w-full max-w-md flex-col items-center",
          "pen-glass-panel rounded-2xl border px-8 pb-8 pt-10 ring-1 ring-white/40 dark:ring-white/10",
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
        <h1 className="text-center text-[18px] font-semibold text-pen-foreground">
          Invitation not found
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-pen-muted">
          This invitation link is invalid or no longer available.
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-pen-blue hover:underline"
        >
          Go to sign in
        </Link>
      </InviteShell>
    );
  }

  if (errorCode && ERROR_COPY[errorCode]) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-pen-foreground">
          Could not accept invitation
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-pen-muted">
          {ERROR_COPY[errorCode]}
        </p>
        {errorCode === "email_mismatch" && (
          <p className="mt-3 text-center text-[12px] text-pen-subtle">
            Invitation was sent to {invite.email}.
          </p>
        )}
        <Link
          href="/"
          className="mt-6 text-[13px] font-medium text-pen-blue hover:underline"
        >
          Go to dashboard
        </Link>
      </InviteShell>
    );
  }

  if (invite.revokedAt) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-pen-foreground">
          Invitation revoked
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-pen-muted">
          This invitation to {invite.department.name} has been revoked.
        </p>
      </InviteShell>
    );
  }

  if (invite.acceptedAt) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-pen-foreground">
          Already accepted
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-pen-muted">
          This invitation has already been used. Sign in to open your dashboard.
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-pen-blue hover:underline"
        >
          Go to sign in
        </Link>
      </InviteShell>
    );
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-pen-foreground">
          Invitation expired
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-pen-muted">
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
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Authenticated + valid invite → accept via route handler (sets cookie + redirects home)
  redirect(`/api/invites/${encodeURIComponent(token)}/accept`);
}
