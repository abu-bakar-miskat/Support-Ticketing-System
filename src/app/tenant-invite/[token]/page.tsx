import { getTenantInvitePreview } from "@/lib/invites/accept-tenant-invite"

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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Tenant invitation</h1>

        {!invite ? (
          <p className="mt-3 text-sm text-red-600">This invitation link is invalid.</p>
        ) : invite.status !== "valid" ? (
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
            {error === "email_mismatch" && (
              <p className="mt-3 text-sm text-red-600">
                You&apos;re signed in with a different email than this invitation was sent to.
              </p>
            )}
            <a
              href={`/api/tenant-invites/${token}/accept`}
              className="mt-5 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Accept invitation
            </a>
          </>
        )}
      </div>
    </div>
  )
}
