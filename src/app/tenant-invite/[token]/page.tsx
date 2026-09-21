import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUnscopedPrisma } from "@/lib/db"
import { getTenantInvitePreview } from "@/lib/invites/accept-tenant-invite"
import { SignOutToAcceptButton } from "@/components/auth/sign-out-to-accept-button"
import { AutoAcceptTenantInvite } from "@/components/auth/auto-accept-tenant-invite"
import { sendLoginCode } from "@/lib/auth/send-login-code"
import { isDevTestAccount } from "@/lib/auth/dev-test-accounts"

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

  // Not signed in (or signed in with a matching email but not yet caught
  // above) and the invite is still usable: skip the "type your email again"
  // login form entirely — send the OTP straight away and land on code entry.
  // A "please wait" resend-cooldown error means a code was already sent
  // moments ago (e.g. a page refresh, or a mail gateway's link prefetch), so
  // treat that as success too rather than surfacing an error.
  if (
    invite &&
    invite.status !== "revoked" &&
    invite.status !== "expired" &&
    !emailMismatch &&
    error !== "email_mismatch"
  ) {
    const next = `/tenant-invite/${token}`
    const nextQuery = `&next=${encodeURIComponent(next)}`
    const email = invite.email.trim().toLowerCase()

    if (isDevTestAccount(email)) {
      redirect(
        `/login?step=sent&email=${encodeURIComponent(email)}&verificationType=magiclink&t=${Date.now()}${nextQuery}`,
      )
    }

    const result = await sendLoginCode(email)
    if (result.error && !result.error.startsWith("Please wait")) {
      redirect(`/login?error=${encodeURIComponent(result.error)}${nextQuery}`)
    }
    redirect(
      `/login?step=sent&email=${encodeURIComponent(email)}&verificationType=${result.verificationType ?? "magiclink"}&t=${Date.now()}${nextQuery}`,
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
