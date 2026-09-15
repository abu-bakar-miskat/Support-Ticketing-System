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
  // Tenant admins / super-admins may invite any role. A department manager may
  // invite only agent/sub_manager into departments they manage — never mint an
  // admin or manager.
  const canInviteAnyRole = profile.isSuperAdmin || isTenantAdmin
  const managedDepartmentIds = profile.managedDepartmentIds ?? []
  const isManager = profile.role === "manager" && managedDepartmentIds.length > 0
  if (!canInviteAnyRole && !isManager) {
    return forbidden("Only a super-admin, a tenant admin, or a department manager can invite members.")
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  const role = (body.role as Role | undefined) ?? "agent"
  const message = (body.message as string | undefined)?.trim() || null
  const rawDepartmentIds = Array.isArray(body.departmentIds)
    ? (body.departmentIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
    : []
  const rawSubDepartmentId =
    typeof body.subDepartmentId === "string" && body.subDepartmentId.length > 0 ? body.subDepartmentId : null

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest("A valid email is required")
  }
  if (!VALID_ROLES.includes(role)) {
    return badRequest("Invalid role")
  }
  // A manager can only invite lower roles.
  if (!canInviteAnyRole && (role === "admin" || role === "manager")) {
    return forbidden("Managers can only invite sub-managers and agents.")
  }

  // Resolve + validate the role's target(s) against this tenant.
  let departmentIds: string[] = []
  let subDepartmentId: string | null = null
  if (role === "admin") {
    // tenant-wide — no department/sub-department.
  } else if (role === "manager") {
    const deptId = rawDepartmentIds[0]
    if (!deptId) return badRequest("Select a department for the manager.")
    const dept = await prisma.department.findFirst({ where: { id: deptId, tenantId }, select: { id: true } })
    if (!dept) return badRequest("Department not found in this tenant.")
    departmentIds = [dept.id]
  } else {
    // sub_manager / agent → a single sub-department.
    if (!rawSubDepartmentId) return badRequest("Select a sub-department.")
    const sub = await prisma.subDepartment.findFirst({
      where: { id: rawSubDepartmentId, tenantId },
      select: { id: true, departmentId: true },
    })
    if (!sub) return badRequest("Sub-department not found in this tenant.")
    // A manager can only invite into departments they manage.
    if (!canInviteAnyRole && !managedDepartmentIds.includes(sub.departmentId)) {
      return forbidden("You can only invite into departments you manage.")
    }
    subDepartmentId = sub.id
  }

  // Invites are for people who don't have an account yet. If one exists, the
  // admin should use "Add existing members" to grant a role instead.
  const existingAccount = await prisma.profile.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  })
  if (existingAccount) {
    return NextResponse.json(
      { error: "This email already has an account — use “Add existing members” to give them a role." },
      { status: 409 },
    )
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
      departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
      subDepartmentId,
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
