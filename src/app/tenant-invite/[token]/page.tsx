import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getUnscopedPrisma } from "@/lib/db"
import { getTenantInvitePreview } from "@/lib/invites/accept-tenant-invite"
import { PenLogo } from "@/components/auth/sts-logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { SignOutToAcceptButton } from "@/components/auth/sign-out-to-accept-button"
import { AutoAcceptTenantInvite } from "@/components/auth/auto-accept-tenant-invite"
import { SubmitButton } from "@/components/auth/submit-button"
import { sendInviteLoginCode } from "@/lib/auth/invite-code-action"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata = { title: "Invitation — Global Support Portal" }

const STATUS_MESSAGE: Record<string, string> = {
  revoked: "This invitation has been revoked.",
  already_accepted: "This invitation has already been used.",
  expired: "This invitation has expired.",
}

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
  )
}

export default async function TenantInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const invite = await getTenantInvitePreview(token)
  const loginHref = `/login?next=${encodeURIComponent(`/tenant-invite/${token}`)}`

  let signedInEmail: string | null = null
  if (invite && (invite.status === "valid" || invite.status === "already_accepted")) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const profile = await getUnscopedPrisma().profile.findUnique({
        where: { id: user.id },
        select: { id: true, email: true },
      })
      signedInEmail = (profile?.email ?? user.email ?? "").toLowerCase() || null

      // Matching session → paint an accepting UI, then hard-navigate to the
      // Route Handler (sets cookies + 303). Do NOT server-redirect here: Next
      // waits on that API inside the RSC flight and leaves a blank page.
      if (
        profile &&
        signedInEmail &&
        signedInEmail === invite.email.toLowerCase() &&
        error !== "email_mismatch"
      ) {
        return (
          <InviteShell>
            <AutoAcceptTenantInvite token={token} />
          </InviteShell>
        )
      }
    }
  }

  const emailMismatch =
    Boolean(invite) &&
    Boolean(signedInEmail) &&
    signedInEmail !== invite!.email.toLowerCase()

  // Not signed in (or signed in with a matching email but not yet caught above)
  // and the invite is still usable: show a one-click "Accept invitation" page.
  // We skip re-typing the email (the invite carries it), but sending the sign-in
  // code MUST be a deliberate click, not a side effect of this GET — mail-security
  // scanners and link prefetchers fetch the invite URL automatically on delivery,
  // and auto-sending here handed those bots an OTP before the human ever clicked,
  // so the invitee saw a stray sign-in code instead of their invitation. Bots
  // don't submit the form; a real click sends the code and lands on code entry.
  if (
    invite &&
    invite.status !== "revoked" &&
    invite.status !== "expired" &&
    !emailMismatch &&
    error !== "email_mismatch"
  ) {
    const email = invite.email.trim().toLowerCase()
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          You&apos;re invited
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          Join{" "}
          <span className="font-medium text-sts-foreground">{invite.tenantName}</span>{" "}
          as{" "}
          <span className="font-medium text-sts-foreground">{invite.role}</span>.
        </p>
        <p className="mt-1 text-center text-[12px] text-sts-subtle">
          Invitation sent to {invite.email}.
        </p>
        <form action={sendInviteLoginCode} className="mt-6 w-full">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={`/tenant-invite/${token}`} />
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
    )
  }

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
    )
  }

  if (invite.status === "revoked" || invite.status === "expired") {
    return (
      <InviteShell>
        <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
          {invite.status === "revoked" ? "Invitation revoked" : "Invitation expired"}
        </h1>
        <p className="mt-2 text-center text-[13.5px] text-sts-muted">
          {STATUS_MESSAGE[invite.status]}
        </p>
        <Link
          href="/login"
          className="mt-6 text-[13px] font-medium text-sts-blue hover:underline"
        >
          Go to sign in
        </Link>
      </InviteShell>
    )
  }

  // Signed in with the wrong account for a still-valid invite.
  return (
    <InviteShell>
      <h1 className="text-center text-[18px] font-semibold text-sts-foreground">
        You&apos;re invited
      </h1>
      <p className="mt-2 text-center text-[13.5px] text-sts-muted">
        Join{" "}
        <span className="font-medium text-sts-foreground">{invite.tenantName}</span>{" "}
        as{" "}
        <span className="font-medium text-sts-foreground">{invite.role}</span>.
      </p>
      <p className="mt-3 text-center text-[12.5px] text-red-600 dark:text-red-400">
        You&apos;re signed in as {signedInEmail ?? "a different account"}. This
        invitation is for {invite.email}. Sign out first, then continue.
      </p>
      <SignOutToAcceptButton invitedEmail={invite.email} loginHref={loginHref} />
    </InviteShell>
  )
}
