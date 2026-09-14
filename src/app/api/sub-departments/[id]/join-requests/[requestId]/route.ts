import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { ensureTenantMembership } from "@/lib/tenant-membership"

// PATCH - approve or reject a join request
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: subDepartmentId, requestId } = await params

  // Must be admin or manager of this subDepartment
  if (profile.role !== "admin") {
    const membership = await (prisma.subDepartmentMembership as any).findUnique({
      where: { userId_subDepartmentId: { userId: profile.id, subDepartmentId } },
    })
    if (!membership || (membership.role !== "manager" && membership.role !== "sub_manager")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const joinRequest = await prisma.joinRequest.findFirst({
    where: { id: requestId, subDepartmentId },
    include: {
      user: { select: { name: true } },
      subDepartment: { select: { name: true, departmentId: true, tenantId: true } },
    },
  })
  if (!joinRequest) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (joinRequest.status !== "pending") {
    return NextResponse.json({ error: "Request already processed" }, { status: 409 })
  }

  const body = await req.json()
  const { action, nickname, isActive, crossAccess } = body as {
    action: "approve" | "reject"
    nickname?: string
    isActive?: boolean
    crossAccess?: boolean
  }

  // Sub-department membership implies membership in its tenant — without a
  // TenantMembership there the tenant-scope extension hides every ticket in this
  // sub-department from the user (cross-tenant joins otherwise 404 the ticket page).
  const subTenantId = joinRequest.subDepartment?.tenantId ?? null

  if (action === "approve" && crossAccess) {
    // Agents/sub-managers get cross-sub-department access via membership in this
    // sub-department (keeping any existing home memberships). DepartmentAccess is
    // reserved for department managers.
    const trimmedName = nickname?.trim() || null
    await prisma.$transaction(async (tx) => {
      await (tx.subDepartmentMembership as any).upsert({
        where: { userId_subDepartmentId: { userId: joinRequest.userId, subDepartmentId } },
        create: {
          userId: joinRequest.userId,
          subDepartmentId,
          role: "agent",
          nickname: trimmedName,
          isActive: isActive ?? true,
        },
        update: {
          nickname: trimmedName,
          isActive: isActive ?? true,
        },
      })
      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      })
      await tx.profile.updateMany({
        where: { id: joinRequest.userId, subDepartmentId: null },
        data: { subDepartmentId },
      })
      if (subTenantId) await ensureTenantMembership(tx, subTenantId, joinRequest.userId)
      await tx.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `approved: You've been granted access to the ${joinRequest.subDepartment?.name ?? "sub-department"} sub-department.`,
        },
      })
    })
    const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
    await syncUserRoleAssignments(joinRequest.userId)
    return NextResponse.json({ ok: true })
  }

  if (action === "approve") {
    const trimmedName = nickname?.trim() || null

    await prisma.$transaction(async (tx) => {
      await (tx.subDepartmentMembership as any).upsert({
        where: { userId_subDepartmentId: { userId: joinRequest.userId, subDepartmentId } },
        create: {
          userId: joinRequest.userId,
          subDepartmentId,
          role: "agent",
          nickname: trimmedName,
          isActive: isActive ?? true,
        },
        update: {
          nickname: trimmedName,
          isActive: isActive ?? true,
        },
      })
      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      })
      // Set Profile.teamId if unset
      await tx.profile.updateMany({
        where: { id: joinRequest.userId, subDepartmentId: null },
        data: { subDepartmentId },
      })
      if (subTenantId) await ensureTenantMembership(tx, subTenantId, joinRequest.userId)
      await tx.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `approved: Your request to join ${joinRequest.subDepartment?.name ?? "the subDepartment"} was approved`,
        },
      })
    })
    const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
    await syncUserRoleAssignments(joinRequest.userId)
  } else {
    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "rejected", processedAt: new Date(), processedBy: profile.id },
      }),
      prisma.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `rejected: Your request to join ${joinRequest.subDepartment?.name ?? "the subDepartment"} was not approved`,
        },
      }),
    ])
  }

  return NextResponse.json({ ok: true })
}
