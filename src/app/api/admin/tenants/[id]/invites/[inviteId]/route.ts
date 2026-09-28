import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { sendTenantInviteEmail } from "@/lib/email"
import { INVITE_TTL_MS } from "@/lib/invites/constants"

type Params = { params: Promise<{ id: string; inviteId: string }> }

/**
 * Whether the caller may manage invites for this tenant. Mirrors the invite POST
 * route: super-admins and tenant-admins may manage any invite; a department
 * manager may manage invites they can see for departments/sub-departments they
 * manage. We resolve the specific invite before deciding for managers.
 */
function canManageTenant(profile: {
  isSuperAdmin?: boolean
  role: string
  tenantMemberships?: { tenantId: string; role: string }[]
  managedDepartmentIds?: string[]
}, tenantId: string): { any: boolean; managedDepartmentIds: string[] } {
  const isTenantAdmin = (profile.tenantMemberships ?? []).some(
    (m) => m.tenantId === tenantId && m.role === "admin",
  )
  return {
    any: Boolean(profile.isSuperAdmin) || isTenantAdmin,
    managedDepartmentIds: profile.role === "manager" ? profile.managedDepartmentIds ?? [] : [],
  }
}

/** A manager may act on an invite only if it targets a department they manage. */
async function managerMayTouch(managedDepartmentIds: string[], invite: { departmentIds: unknown; subDepartmentId: string | null }): Promise<boolean> {
  if (managedDepartmentIds.length === 0) return false
  const deptIds = Array.isArray(invite.departmentIds)
    ? (invite.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
    : []
  if (deptIds.some((d) => managedDepartmentIds.includes(d))) return true
  if (invite.subDepartmentId) {
    const sub = await prisma.subDepartment.findUnique({
      where: { id: invite.subDepartmentId },
      select: { departmentId: true },
    })
    if (sub && managedDepartmentIds.includes(sub.departmentId)) return true
  }
  return false
}

/** Delete a pending tenant invite. */
export async function DELETE(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId, inviteId } = await params

  const invite = await prisma.tenantInvite.findFirst({
    where: { id: inviteId, tenantId },
    select: { id: true, departmentIds: true, subDepartmentId: true },
  })
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const perms = canManageTenant(profile!, tenantId)
  if (!perms.any && !(await managerMayTouch(perms.managedDepartmentIds, invite))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.tenantInvite.delete({ where: { id: inviteId } })
  return NextResponse.json({ ok: true })
}

/** Resend a pending tenant invite: refresh its expiry and re-send the email. */
export async function POST(_req: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId, inviteId } = await params

  const invite = await prisma.tenantInvite.findFirst({
    where: { id: inviteId, tenantId },
    select: {
      id: true, email: true, role: true, message: true, token: true,
      departmentIds: true, subDepartmentId: true, acceptedAt: true, revokedAt: true,
    },
  })
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (invite.acceptedAt) return NextResponse.json({ error: "Invite already accepted" }, { status: 409 })
  if (invite.revokedAt) return NextResponse.json({ error: "Invite was revoked" }, { status: 409 })

  const perms = canManageTenant(profile!, tenantId)
  if (!perms.any && !(await managerMayTouch(perms.managedDepartmentIds, invite))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  // Push the expiry out so the resent link is valid for a fresh window, and reset
  // the reminder flag so the pending-reminder sweep can fire again.
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await prisma.tenantInvite.update({
    where: { id: inviteId },
    data: { expiresAt, reminderSentAt: null },
  })

  try {
    await sendTenantInviteEmail({
      to: invite.email,
      inviterName: profile!.name,
      inviterId: profile!.id,
      tenantId,
      tenantName: tenant.name,
      role: invite.role,
      message: invite.message,
      inviteToken: invite.token,
      expiresAt,
    })
  } catch (err) {
    console.error("[tenant-invites] failed to resend invite email:", err)
    return NextResponse.json({ error: "Failed to send invite email" }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
