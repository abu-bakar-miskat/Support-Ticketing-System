import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { badRequest, forbidden } from "@/lib/api-response"
import { sendTenantInviteEmail } from "@/lib/email"
import { INVITE_TTL_MS } from "@/lib/invites/constants"
import type { Role } from "@/generated/prisma/enums"

const VALID_ROLES: Role[] = ["admin", "manager", "sub_manager", "agent"]

type Params = { params: Promise<{ id: string }> }

/**
 * Invite an email into a tenant. Allowed for super-admins and for tenant-admins
 * of THIS tenant (a membership with role "admin"). Tenant-admins cannot invite
 * into other tenants.
 */
export async function POST(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: tenantId } = await params

  const isTenantAdmin = (profile.tenantMemberships ?? []).some(
    (m) => m.tenantId === tenantId && m.role === "admin",
  )
  if (!profile.isSuperAdmin && !isTenantAdmin) {
    return forbidden("Only a super-admin or an admin of this tenant can invite members.")
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const role = (body.role as Role | undefined) ?? "agent"
  const message = (body.message as string | undefined)?.trim() || null

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest("A valid email is required")
  }
  if (!VALID_ROLES.includes(role)) {
    return badRequest("Invalid role")
  }

  const existing = await prisma.tenantInvite.findFirst({
    where: { tenantId, email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: "A pending invite already exists for this email" }, { status: 409 })
  }

  const token = randomBytes(32).toString("hex")
  const invite = await prisma.tenantInvite.create({
    data: {
      token,
      email,
      tenantId,
      role,
      message,
      invitedBy: profile.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: { id: true, email: true, role: true, token: true, expiresAt: true },
  })

  // Email the invitee so the 72h clock and the 24h reminder have something to
  // reference. Delivery failure shouldn't lose the invite — the accept link is
  // still returned for manual sharing — so this is best-effort.
  try {
    await sendTenantInviteEmail({
      to: email,
      inviterName: profile.name,
      inviterId: profile.id,
      tenantId,
      tenantName: tenant.name,
      role,
      message,
      inviteToken: invite.token,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error("[tenant-invites] failed to send invite email:", err)
  }

  return NextResponse.json(
    { ...invite, acceptPath: `/tenant-invite/${invite.token}` },
    { status: 201 },
  )
}
