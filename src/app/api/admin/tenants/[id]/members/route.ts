import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { badRequest, forbidden, notFound } from "@/lib/api-response"
import {
  applyTenantMembership,
  findOtherTenantAdminConflict,
  TENANT_ADMIN_EXCLUSIVE_ERROR,
  TenantAdminExclusiveError,
} from "@/lib/tenant-membership"
import { recordAuditEvent } from "@/lib/audit-log"
import { resolveUserPrimaryDepartmentId } from "@/lib/dept-scope"
import { broadcastForceLogout } from "@/lib/realtime-broadcast"
import { sendTenantInviteEmail } from "@/lib/email"
import { INVITE_TTL_MS } from "@/lib/invites/constants"
import type { Role } from "@/generated/prisma/enums"

const VALID_ROLES: Role[] = ["admin", "manager", "sub_manager", "agent"]

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

/** Search profiles by name/email for the "Add member" dropdown, excluding current members. */
export async function GET(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId } = await params

  if (!canManage(profile, tenantId)) {
    return forbidden("Only a super-admin or an admin of this tenant can view members.")
  }

  const url = new URL(request.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ users: [] })
  // When picking someone to make tenant admin, hide anyone who already
  // administers another organisation — they can't hold a second admin seat.
  const forAdminRole = (url.searchParams.get("role") ?? "").toLowerCase() === "admin"

  const currentMembers = await prisma.tenantMembership.findMany({
    where: { tenantId, isActive: true },
    select: { userId: true },
  })
  const excludeIds = new Set(currentMembers.map((m) => m.userId))

  if (forAdminRole) {
    const otherAdmins = await prisma.tenantMembership.findMany({
      where: { role: "admin", isActive: true, tenantId: { not: tenantId } },
      select: { userId: true },
    })
    for (const row of otherAdmins) excludeIds.add(row.userId)
  }

  const users = await prisma.profile.findMany({
    where: {
      deletedAt: null,
      ...(excludeIds.size > 0 ? { id: { notIn: [...excludeIds] } } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 8,
  })
  return NextResponse.json({ users })
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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const role = (body.role as Role | undefined) ?? "agent"
  const departmentIds = Array.isArray(body.departmentIds)
    ? (body.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
    : []
  const subDepartmentId =
    typeof body.subDepartmentId === "string" && body.subDepartmentId ? body.subDepartmentId : null

  const needsSubDepartment = role === "sub_manager" || role === "agent"

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest("A valid email is required")
  if (!VALID_ROLES.includes(role)) return badRequest("Invalid role")
  if (role !== "admin" && departmentIds.length === 0) {
    return badRequest("Select at least one department for a manager, sub-manager, or agent")
  }
  if (needsSubDepartment && !subDepartmentId) {
    return badRequest("Select a sub-department for a sub-manager or agent")
  }
  // The chosen sub-department must belong to this tenant and to a picked department.
  if (needsSubDepartment && subDepartmentId) {
    const sub = await prisma.subDepartment.findFirst({
      where: { id: subDepartmentId, tenantId, departmentId: { in: departmentIds } },
      select: { id: true },
    })
    if (!sub) return badRequest("The selected sub-department is not part of the chosen department")
  }

  const existing = await prisma.profile.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })

  if (existing) {
    if (role === "admin") {
      const conflict = await findOtherTenantAdminConflict(prisma, existing.id, tenantId)
      if (conflict) {
        return NextResponse.json({ error: TENANT_ADMIN_EXCLUSIVE_ERROR }, { status: 409 })
      }
    }
    try {
      await applyTenantMembership(prisma, {
        tenantId,
        userId: existing.id,
        role: role as "admin" | "manager" | "sub_manager" | "agent",
        departmentIds,
        subDepartmentId: needsSubDepartment ? subDepartmentId : null,
        actorId: profile.id,
      })
    } catch (e) {
      if (e instanceof TenantAdminExclusiveError) {
        return NextResponse.json({ error: e.message }, { status: 409 })
      }
      throw e
    }
    return NextResponse.json({ added: true, member: { ...existing, role } })
  }

  // No such user yet — create an invite carrying the role + department scope.
  const dup = await prisma.tenantInvite.findFirst({
    where: { tenantId, email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  })
  if (dup) return NextResponse.json({ error: "A pending invite already exists for this email" }, { status: 409 })

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await prisma.tenantInvite.create({
    data: {
      token,
      email,
      tenantId,
      role,
      departmentIds: role === "admin" ? undefined : departmentIds,
      subDepartmentId: needsSubDepartment ? subDepartmentId : null,
      invitedBy: profile.id,
      expiresAt,
    },
  })

  // Best-effort: email the invitee so the 24h window + 12h reminder apply. The
  // accept link is still returned so a delivery failure never blocks the invite.
  let emailDelivery: { status: "sent"; via: "mailpit" | "resend" } | { status: "failed" }
  try {
    const delivery = await sendTenantInviteEmail({
      to: email,
      inviterName: profile.name,
      inviterId: profile.id,
      tenantId,
      tenantName: tenant.name,
      role,
      departmentId: departmentIds[0] ?? null,
      inviteToken: token,
      expiresAt,
    })
    emailDelivery = { status: "sent", via: delivery.via }
  } catch (err) {
    console.error("[tenant-members] failed to send invite email:", err)
    emailDelivery = { status: "failed" }
  }

  return NextResponse.json(
    { invited: true, email, role, acceptPath: `/tenant-invite/${token}`, emailDelivery },
    { status: 201 },
  )
}

/**
 * Restrict or re-enable a member's account (Profile.isActive) without
 * removing their tenant membership or any data — distinct from DELETE below,
 * which drops the membership entirely. Mirrors the SA-03 pattern already
 * used by PATCH /api/admin/users/[id]: force-logout within 60s on restrict.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id: tenantId } = await params

  if (!canManage(profile, tenantId)) {
    return forbidden("Only a super-admin or an admin of this tenant can restrict members.")
  }

  const body = await request.json().catch(() => ({}))
  const userId = (body.userId as string | undefined)?.trim()
  const isActive = body.isActive
  if (!userId) return badRequest("userId is required")
  if (typeof isActive !== "boolean") return badRequest("isActive must be a boolean")

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { userId: true },
  })
  if (!membership) return notFound("This user is not a member of this tenant")

  const before = await prisma.profile.findUnique({ where: { id: userId }, select: { isActive: true } })
  const updated = await prisma.profile.update({
    where: { id: userId },
    data: { isActive },
    select: { id: true, isActive: true },
  })

  // Attribute the restriction to the member's department too, so it appears in
  // that department's audit view — not only the tenant-wide one.
  const departmentId = await resolveUserPrimaryDepartmentId(userId, tenantId)
  await recordAuditEvent({
    tenantId,
    departmentId,
    actorId: profile.id,
    action: isActive ? "USER_REENABLED" : "USER_RESTRICTED",
    targetType: "Profile",
    targetId: userId,
    before,
    after: { isActive },
  })

  if (!isActive && before?.isActive !== false) {
    await broadcastForceLogout([userId], "Your account has been restricted. Contact your administrator for access.")
  }

  return NextResponse.json(updated)
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

  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { role: true },
  })

  // Removing a tenant member is a privileged access change — record it in the
  // same transaction so the removal never lands without an audit trail.
  // Drop EVERY tie the user has within this tenant (not just the TenantMembership
  // row): sub-department memberships, department manager/member/access grants, and
  // project memberships all live under tenant-scoped parents, so a bare
  // TenantMembership delete would leave the user still surfacing on the members
  // roster (which unions sub-department memberships) and holding stale access. The
  // Profile itself is kept — this removes them from THIS tenant only, not globally.
  await prisma.$transaction(async (tx) => {
    await (tx.subDepartmentMembership as any).deleteMany({ where: { userId, subDepartment: { tenantId } } })
    await tx.departmentManager.deleteMany({ where: { userId, department: { tenantId } } })
    await tx.departmentMember.deleteMany({ where: { userId, department: { tenantId } } })
    await tx.departmentAccess.deleteMany({ where: { userId, department: { tenantId } } })
    await (tx.projectMember as any).deleteMany({ where: { userId, project: { tenantId } } })
    // Clear the primary sub-department pointer if it lived in this tenant.
    await tx.profile.updateMany({ where: { id: userId, subDepartment: { tenantId } }, data: { subDepartmentId: null } })
    await tx.tenantMembership.deleteMany({ where: { tenantId, userId } })
    await recordAuditEvent({
      tenantId,
      actorId: profile.id,
      action: "TENANT_MEMBER_REMOVED",
      targetType: "Profile",
      targetId: userId,
      before: { role: membership?.role ?? null },
      after: null,
      client: tx,
    })
  })
  // Rebuild the canonical RoleAssignment rows (and invalidate the cached scope)
  // so this tenant-membership removal takes effect on reads immediately, rather
  // than waiting for the empty-table reconciliation path (see lib/role-assignment).
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(userId)
  return NextResponse.json({ ok: true })
}
