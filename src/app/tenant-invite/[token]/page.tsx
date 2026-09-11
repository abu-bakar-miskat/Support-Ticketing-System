import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { getTenantInvitePreview } from "@/lib/invites/accept-tenant-invite"
import { SignOutToAcceptButton } from "@/components/auth/sign-out-to-accept-button"

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
      const profile = await prisma.profile.findUnique({
        where: { id: user.id },
        select: { id: true, email: true },
      })
      signedInEmail = (profile?.email ?? user.email ?? "").toLowerCase() || null

      // Matching session → accept via the Route Handler (may set cookies).
      // Never cookies().set() in this Server Component — that throws in prod:
      // "Cookies can only be modified in a Server Action or Route Handler."
      if (
        profile &&
        signedInEmail &&
        signedInEmail === invite.email.toLowerCase() &&
        error !== "email_mismatch"
      ) {
        redirect(`/api/tenant-invites/${encodeURIComponent(token)}/accept`)
      }
    }
  }

  const emailMismatch =
    Boolean(invite) &&
    Boolean(signedInEmail) &&
    signedInEmail !== invite!.email.toLowerCase()

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
            {(emailMismatch || error === "email_mismatch") && (
              <p className="mt-3 text-sm text-red-600">
                You&apos;re signed in as {signedInEmail ?? "a different account"}. This
                invitation is for {invite.email}. Sign out first, then continue.
              </p>
            )}
            {emailMismatch || error === "email_mismatch" ? (
              <SignOutToAcceptButton
                invitedEmail={invite.email}
                loginHref={loginHref}
              />
            ) : (
              <a
                href={loginHref}
                className="mt-5 inline-block rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Sign in to accept
              </a>
            )}
          </>
        )}
      </div>
    </div>
  )
}
