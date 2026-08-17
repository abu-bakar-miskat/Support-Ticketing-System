import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { badRequest, forbidden } from "@/lib/api-response"
import { applyTenantMembership } from "@/lib/tenant-membership"
import type { Role } from "@/generated/prisma/enums"

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const VALID_ROLES: Role[] = ["admin", "manager", "lead", "staff"]

type Params = { params: Promise<{ id: string }> }

/** Super-admins, or an admin of THIS tenant, may manage its members. */
function canManage(
  profile: {
    isSuperAdmin?: boolean
    tenantMemberships?: { tenantId: string; role: string }[]
  },
  tenantId: string,
): boolean {
  if (profile.isSuperAdmin) return true
  return (profile.tenantMemberships ?? []).some(
    (m) => m.tenantId === tenantId && m.role === "admin",
  )
}

/**
 * Add or invite a user to a tenant. If a profile with the email already exists,
 * they're added immediately (membership upserted); otherwise a tenant invite is
 * created and its accept link returned.
 */
export async function POST(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId } = await params

  if (!canManage(profile, tenantId)) {
    return forbidden("Only a super-admin or an admin of this tenant can add members.")
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const role = (body.role as Role | undefined) ?? "staff"
  const departmentIds = Array.isArray(body.departmentIds)
    ? (body.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
    : []

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest("A valid email is required")
  if (!VALID_ROLES.includes(role)) return badRequest("Invalid role")
  if (role !== "admin" && departmentIds.length === 0) {
    return badRequest("Select at least one department for a manager, lead, or staff member")
  }

  const existing = await prisma.profile.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })

  if (existing) {
    await applyTenantMembership(prisma, {
      tenantId,
      userId: existing.id,
      role: role as "admin" | "manager" | "lead" | "staff",
      departmentIds,
      actorId: profile.id,
    })
    return NextResponse.json({ added: true, member: { ...existing, role } })
  }

  // No such user yet — create an invite carrying the role + department scope.
  const dup = await prisma.tenantInvite.findFirst({
    where: { tenantId, email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  })
  if (dup) return NextResponse.json({ error: "A pending invite already exists for this email" }, { status: 409 })

  const token = randomBytes(32).toString("hex")
  await prisma.tenantInvite.create({
    data: {
      token,
      email,
      tenantId,
      role,
      departmentIds: role === "admin" ? undefined : departmentIds,
      invitedBy: profile.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  })
  return NextResponse.json(
    { invited: true, email, role, acceptPath: `/tenant-invite/${token}` },
    { status: 201 },
  )
}

/** Remove a user from a tenant. */
export async function DELETE(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId } = await params

  if (!canManage(profile, tenantId)) {
    return forbidden("Only a super-admin or an admin of this tenant can remove members.")
  }

  const body = await request.json().catch(() => ({}))
  const userId = (body.userId as string | undefined)?.trim()
  if (!userId) return badRequest("userId is required")

  await prisma.tenantMembership.deleteMany({ where: { tenantId, userId } })
  return NextResponse.json({ ok: true })
}
