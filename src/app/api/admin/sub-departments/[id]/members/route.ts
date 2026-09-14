import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import type { AuthProfile } from "@/lib/auth"
import { isValidSubDepartmentRole } from "@/lib/role-management"
import { ensureTenantMembership } from "@/lib/tenant-membership"
import { recordAuditEvent } from "@/lib/audit-log"

async function assertSubDepartmentScope(subDepartmentId: string, caller: AuthProfile): Promise<NextResponse | null> {
  if (caller.role === "admin") return null
  const subDepartment = await prisma.subDepartment.findUnique({ where: { id: subDepartmentId }, select: { departmentId: true } })
  if (!subDepartment) return NextResponse.json({ error: "SubDepartment not found" }, { status: 404 })
  // Write operations restricted to directly-managed departments — cross-access grants do not apply
  const directlyManages: string[] = (caller as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(subDepartment.departmentId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

// POST — assign a profile to a subDepartment (admin or manager scoped to their depts)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { userId, nickname, isActive, role } = body as {
    userId: string
    nickname?: string
    isActive?: boolean
    role?: string
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }
  if (role !== undefined && !isValidSubDepartmentRole(role)) {
    return NextResponse.json(
      { error: "role must be sub_manager or agent for a sub-department membership" },
      { status: 400 },
    )
  }

  const [subDepartment, profile] = await Promise.all([
    prisma.subDepartment.findUnique({ where: { id: subDepartmentId } }),
    prisma.profile.findUnique({ where: { id: userId } }),
  ])

  if (!subDepartment) return NextResponse.json({ error: "SubDepartment not found" }, { status: 404 })
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const trimmedName = nickname?.trim() || null

  const membership = await prisma.$transaction(async (tx) => {
    const before = await (tx.subDepartmentMembership as any).findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      select: { role: true, isActive: true, nickname: true },
    })
    const saved = await (tx.subDepartmentMembership as any).upsert({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      create: { userId, subDepartmentId, role: (role as any) ?? "agent", nickname: trimmedName, isActive: isActive ?? true },
      update: { nickname: trimmedName, isActive: isActive ?? true, ...(role ? { role: role as any } : {}) },
    })
    await tx.profile.updateMany({ where: { id: userId, subDepartmentId: null }, data: { subDepartmentId } })

    // Sub-department membership implies membership in its tenant. Without this the
    // tenant-scope extension hides every ticket in this sub-department from the
    // user when it lives in a tenant they don't already belong to.
    await ensureTenantMembership(tx, subDepartment.tenantId, userId)

    await recordAuditEvent({
      tenantId: subDepartment.tenantId,
      departmentId: subDepartment.departmentId,
      actorId: caller!.id,
      action: before ? "SUB_DEPARTMENT_MEMBER_UPDATED" : "SUB_DEPARTMENT_MEMBER_ADDED",
      targetType: "Profile",
      targetId: userId,
      before: before ?? null,
      after: { role: saved.role, isActive: saved.isActive, nickname: saved.nickname },
      client: tx,
    })
    return saved
  })

  // Rebuild the canonical scope rows (SRS D-06) from the now-committed tenant +
  // sub-department memberships. Runs on the root client after the interactive
  // transaction commits — its own FOR UPDATE transaction must not nest.
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(userId)

  return NextResponse.json(membership, { status: 201 })
}

// GET — list current members of a subDepartment (admin or manager scoped to their depts)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const members = await prisma.subDepartmentMembership.findMany({
    where: { subDepartmentId },
    orderBy: { joinedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
    },
  })

  return NextResponse.json(members)
}

// PATCH — update membership flags (isActive, doNotAssign, role)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { userId, isActive, doNotAssign, role } = body as {
    userId: string
    isActive?: boolean
    doNotAssign?: boolean
    role?: string
  }

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
  if (role !== undefined && !isValidSubDepartmentRole(role)) {
    return NextResponse.json(
      { error: "role must be sub_manager or agent for a sub-department membership" },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {}
  if (isActive !== undefined) data.isActive = isActive
  if (doNotAssign !== undefined) data.doNotAssign = doNotAssign
  if (role) data.role = role

  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { tenantId: true, departmentId: true },
  })
  if (!subDepartment) return NextResponse.json({ error: "SubDepartment not found" }, { status: 404 })

  const updated = await prisma.$transaction(async (tx) => {
    const before = await (tx.subDepartmentMembership as any).findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      select: { role: true, isActive: true, doNotAssign: true },
    })
    const saved = await (tx.subDepartmentMembership as any).update({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      data,
    })
    await recordAuditEvent({
      tenantId: subDepartment.tenantId,
      departmentId: subDepartment.departmentId,
      actorId: caller!.id,
      action: "SUB_DEPARTMENT_MEMBER_UPDATED",
      targetType: "Profile",
      targetId: userId,
      before,
      after: { role: saved.role, isActive: saved.isActive, doNotAssign: saved.doNotAssign },
      client: tx,
    })
    return saved
  })

  return NextResponse.json(updated)
}

// DELETE — remove a member from a subDepartment (admin or manager scoped to their depts)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: subDepartmentId } = await params
  const scopeError = await assertSubDepartmentScope(subDepartmentId, caller!)
  if (scopeError) return scopeError

  const { userId } = await req.json()

  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { tenantId: true, departmentId: true },
  })
  if (!subDepartment) return NextResponse.json({ error: "SubDepartment not found" }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    const before = await tx.subDepartmentMembership.findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      select: { role: true, isActive: true },
    })
    await tx.subDepartmentMembership.deleteMany({ where: { userId, subDepartmentId } })

    // Profile.teamId is a legacy primary membership pointer. Keep it valid when the
    // membership it points to is removed, without disturbing any other memberships.
    const remaining = await tx.subDepartmentMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { joinedAt: "asc" },
      select: { subDepartmentId: true },
    })
    await tx.profile.updateMany({
      where: { id: userId, subDepartmentId },
      data: { subDepartmentId: remaining?.subDepartmentId ?? null },
    })

    await recordAuditEvent({
      tenantId: subDepartment.tenantId,
      departmentId: subDepartment.departmentId,
      actorId: caller!.id,
      action: "SUB_DEPARTMENT_MEMBER_REMOVED",
      targetType: "Profile",
      targetId: userId,
      before: before ?? null,
      after: null,
      client: tx,
    })
  })

  return new NextResponse(null, { status: 204 })
}
