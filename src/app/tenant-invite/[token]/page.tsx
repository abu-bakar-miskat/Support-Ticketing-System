import { createClient } from "@/lib/supabase/server"
import { getUnscopedPrisma } from "@/lib/db"
import { getTenantInvitePreview } from "@/lib/invites/accept-tenant-invite"
import { SignOutToAcceptButton } from "@/components/auth/sign-out-to-accept-button"
import { AutoAcceptTenantInvite } from "@/components/auth/auto-accept-tenant-invite"
import { SubmitButton } from "@/components/auth/submit-button"
import { sendInviteLoginCode } from "@/lib/auth/invite-code-action"

export const dynamic = "force-dynamic"

const STATUS_MESSAGE: Record<string, string> = {
  revoked: "This invitation has been revoked.",
  already_accepted: "This invitation has already been used.",
  expired: "This invitation has expired.",
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
        return <AutoAcceptTenantInvite token={token} />
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
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <div className="rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">You&apos;re invited</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Join{" "}
            <span className="font-medium text-foreground">{invite.tenantName}</span> as{" "}
            <span className="font-medium text-foreground">{invite.role}</span>.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Invitation sent to {invite.email}.
          </p>
          <form action={sendInviteLoginCode} className="mt-5">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="next" value={`/tenant-invite/${token}`} />
            <SubmitButton
              pendingLabel="Sending code…"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
            >
              Accept invitation
            </SubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            We&apos;ll email you a one-time sign-in code to continue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Tenant invitation</h1>

        {!invite ? (
          <p className="mt-3 text-sm text-red-600">This invitation link is invalid.</p>
        ) : invite.status === "revoked" || invite.status === "expired" ? (
          <p className="mt-3 text-sm text-red-600">{STATUS_MESSAGE[invite.status]}</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              You&apos;ve been invited to join{" "}
              <span className="font-medium text-foreground">{invite.tenantName}</span> as{" "}
              <span className="font-medium text-foreground">{invite.role}</span>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Invitation sent to {invite.email}. Sign in with that address to accept.
            </p>
            <p className="mt-3 text-sm text-red-600">
              You&apos;re signed in as {signedInEmail ?? "a different account"}. This
              invitation is for {invite.email}. Sign out first, then continue.
            </p>
            <SignOutToAcceptButton
              invitedEmail={invite.email}
              loginHref={loginHref}
            />
          </>
        )}
      </div>
    </div>
  )
}
