import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth"
import { listMailboxConnectionsForSubDepartment, createMailboxConnection } from "@/lib/mailbox-connection"
import { assertFeatureEnabled } from "@/lib/feature-flags"
import { checkDomainVerification } from "@/lib/resend-domains"
import { prepareImapConnection } from "@/lib/mailbox-imap"

const AUTH_TYPES = ["RESEND", "OAUTH_M365", "OAUTH_GOOGLE", "IMAP"] as const
// RESEND and IMAP are created here. OAuth mailboxes (M365 / Google) need the
// admin to sign in with the provider, so they're created by the
// /api/admin/mailbox-oauth/[provider] flow instead.
const IMPLEMENTED_AUTH_TYPES = new Set(["RESEND", "IMAP"])

type Params = { params: Promise<{ id: string }> }

async function loadSubDepartmentInScope(
  subDepartmentId: string,
  caller: Parameters<typeof assertDepartmentAdmin>[0],
) {
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { id: true, departmentId: true, tenantId: true },
  })
  if (!subDepartment) return { subDepartment: null, error: NextResponse.json({ error: "Sub-department not found" }, { status: 404 }) }

  // Mailbox connections are department admin-only (role-hierarchy.md): a tenant
  // admin or an Admin of the sub-department's parent department may manage them.
  const scopeError = assertDepartmentAdmin(caller, subDepartment.departmentId)
  if (scopeError) return { subDepartment: null, error: scopeError }
  return { subDepartment, error: null }
}

// EM-01/02/03 (sub-department scope): dedicated shared mailbox for a single
// sub-department. teamId/departmentId are always resolved from the URL, so
// callers can't connect a mailbox to any sub-department outside their scope.
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const { subDepartment, error: scopeError } = await loadSubDepartmentInScope(id, caller!)
  if (scopeError) return scopeError

  const connections = await listMailboxConnectionsForSubDepartment(subDepartment!.id)
  return NextResponse.json(connections)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const { subDepartment, error: scopeError } = await loadSubDepartmentInScope(id, caller!)
  if (scopeError) return scopeError

  const body = await req.json().catch(() => ({}))
  const { address, authType, plaintextCredentials } = body as {
    address?: string
    authType?: string
    plaintextCredentials?: string | null
  }

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 })
  }
  const resolvedAuthType = authType ?? "RESEND"
  if (!AUTH_TYPES.includes(resolvedAuthType as never)) {
    return NextResponse.json({ error: `authType must be one of ${AUTH_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!IMPLEMENTED_AUTH_TYPES.has(resolvedAuthType)) {
    return NextResponse.json(
      { error: `${resolvedAuthType} mailboxes are connected by signing in with the provider, not by this endpoint` },
      { status: 400 },
    )
  }

  // Resend routes by address on its inbound domain, so that domain must be
  // set up for receiving. IMAP reads the mailbox directly — no domain setup.
  if (resolvedAuthType === "RESEND") {
    const verification = await checkDomainVerification(address)
    if (verification.status !== "verified" || !verification.receivingEnabled) {
      return NextResponse.json(
        { error: `The ${verification.domain ?? "email"} domain is not ready to receive mail in Resend. Enable receiving and verify its MX record first.` },
        { status: 400 },
      )
    }
  }

  const featureCheck = await assertFeatureEnabled(subDepartment!.tenantId, "mailboxConnections")
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 })
  }

  // IMAP: validate and test-sign-in before saving, and start syncing from now.
  let imap: Awaited<ReturnType<typeof prepareImapConnection>> | null = null
  if (resolvedAuthType === "IMAP") {
    imap = await prepareImapConnection(plaintextCredentials)
    if (!imap.ok) return NextResponse.json({ error: imap.error }, { status: 400 })
  }

  try {
    const connection = await createMailboxConnection({
      tenantId: subDepartment!.tenantId,
      departmentId: subDepartment!.departmentId,
      subDepartmentId: subDepartment!.id,
      scopeType: "SUB_DEPARTMENT",
      address,
      authType: resolvedAuthType as never,
      plaintextCredentials: imap?.ok ? JSON.stringify(imap.credentials) : plaintextCredentials,
      syncCursor: imap?.ok ? imap.syncCursor : undefined,
      actorId: caller!.id,
    })
    return NextResponse.json(connection, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That address is already connected" }, { status: 409 })
    }
    throw err
  }
}
