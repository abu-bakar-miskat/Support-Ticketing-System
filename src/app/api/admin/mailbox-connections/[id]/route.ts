import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { canAdminDeptSettings } from "@/lib/dept-scope"
import { updateMailboxConnection, deleteMailboxConnection, replacePullCredentials } from "@/lib/mailbox-connection"
import { checkDomainVerification } from "@/lib/resend-domains"
import { prepareImapConnection } from "@/lib/mailbox-imap"
import { AssignmentMethod } from "@/generated/prisma/enums"
import type { AuthProfile } from "@/lib/auth"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

// Mailbox connection + its per-mailbox assignment method are admin-only settings
// (role-hierarchy.md). Plain managers are excluded — only tenant/department admins.
function assertScope(caller: AuthProfile, departmentId: string): NextResponse | null {
  if (!canAdminDeptSettings(caller, departmentId)) {
    return NextResponse.json({ error: "You must be an admin of this department." }, { status: 403 })
  }
  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const existing = await prisma.mailboxConnection.findUnique({
    where: { id },
    select: { departmentId: true, subDepartmentId: true, authType: true },
  })
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  }
  const scopeError = await assertScope(caller!, existing.departmentId)
  if (scopeError) return scopeError

  const body = await req.json().catch(() => ({}))
  const { address, plaintextCredentials } = body as { address?: string; plaintextCredentials?: string | null }
  const assignmentMethod = body.assignmentMethod as unknown
  const manualAssigneeIds = body.manualAssigneeIds as unknown
  const isActive = body.isActive as unknown

  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 })
  }

  const isOAuth = existing.authType === "OAUTH_M365" || existing.authType === "OAUTH_GOOGLE"
  if (isOAuth && (address !== undefined || plaintextCredentials !== undefined)) {
    return NextResponse.json(
      { error: "This mailbox is tied to the account that signed in. Use Reconnect to change it." },
      { status: 400 },
    )
  }

  // IMAP: new settings are validated and test-signed-in before they replace
  // the stored ones (and clear any failure state).
  if (existing.authType === "IMAP" && plaintextCredentials !== undefined) {
    const imap = await prepareImapConnection(plaintextCredentials)
    if (!imap.ok) return NextResponse.json({ error: imap.error }, { status: 400 })
    await replacePullCredentials(id, imap.credentials, caller!.id)
  }

  if (address !== undefined && existing.authType === "RESEND") {
    const verification = await checkDomainVerification(address)
    if (verification.status !== "verified" || !verification.receivingEnabled) {
      return NextResponse.json(
        { error: `The ${verification.domain ?? "email"} domain is not ready to receive mail in Resend. Enable receiving and verify its MX record first.` },
        { status: 400 },
      )
    }
  }

  // Per-mailbox assignment override. null = inherit the sub-department's method;
  // otherwise one of the enum values. MANUAL_SELECT needs a validated member list.
  const methodProvided = assignmentMethod !== undefined
  let manualIds: string[] | undefined
  if (methodProvided) {
    const methodValid =
      assignmentMethod === null ||
      (typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod))
    if (!methodValid) {
      return NextResponse.json(
        { error: `assignmentMethod must be null (inherit) or one of ${[...VALID_METHODS].join(", ")}` },
        { status: 400 },
      )
    }
    if (
      manualAssigneeIds !== undefined &&
      !(Array.isArray(manualAssigneeIds) && manualAssigneeIds.every((x) => typeof x === "string"))
    ) {
      return NextResponse.json({ error: "manualAssigneeIds must be an array of user IDs" }, { status: 400 })
    }
    if (assignmentMethod === "MANUAL_SELECT") {
      if (!Array.isArray(manualAssigneeIds) || manualAssigneeIds.length === 0) {
        return NextResponse.json(
          { error: "Select at least one member for the Manual (selected members) method." },
          { status: 400 },
        )
      }
      const requested = [...new Set(manualAssigneeIds as string[])]
      const validMembers = await prisma.subDepartmentMembership.findMany({
        where: { subDepartmentId: existing.subDepartmentId, isActive: true, userId: { in: requested } },
        select: { userId: true },
      })
      const validIds = new Set(validMembers.map((m) => m.userId))
      if (requested.some((uid) => !validIds.has(uid))) {
        return NextResponse.json(
          { error: "Every selected member must be an active member of this sub-department." },
          { status: 400 },
        )
      }
      manualIds = requested
    } else {
      // Any other method clears the list so a stale selection can't re-activate.
      manualIds = []
    }
  }

  const updated = await updateMailboxConnection(
    id,
    {
      address,
      // Pull credentials were replaced above; only RESEND stores them as-is.
      plaintextCredentials: existing.authType === "RESEND" ? plaintextCredentials : undefined,
      ...(methodProvided ? { assignmentMethod: assignmentMethod as AssignmentMethod | null, manualAssigneeIds: manualIds } : {}),
      ...(isActive !== undefined ? { isActive: isActive as boolean } : {}),
    },
    caller!.id,
  )
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const existing = await prisma.mailboxConnection.findUnique({ where: { id }, select: { departmentId: true } })
  if (!existing) {
    return new NextResponse(null, { status: 204 })
  }
  const scopeError = await assertScope(caller!, existing.departmentId)
  if (scopeError) return scopeError

  await deleteMailboxConnection(id, caller!.id)
  return new NextResponse(null, { status: 204 })
}
