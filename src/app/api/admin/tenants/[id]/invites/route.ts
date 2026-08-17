import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { badRequest, forbidden } from "@/lib/api-response"
import type { Role } from "@/generated/prisma/enums"

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const VALID_ROLES: Role[] = ["admin", "manager", "lead", "staff"]

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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const role = (body.role as Role | undefined) ?? "staff"
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

  // Return the accept link so the caller can share it (email delivery is out of
  // scope for the dev flow; wire sendInviteEmail here when ready).
  return NextResponse.json(
    { ...invite, acceptPath: `/tenant-invite/${invite.token}` },
    { status: 201 },
  )
}
