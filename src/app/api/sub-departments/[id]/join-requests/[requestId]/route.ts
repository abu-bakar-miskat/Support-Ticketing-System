import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

// PATCH - approve or reject a join request
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: subDepartmentId, requestId } = await params

  // Must be admin or manager of this team
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
      subDepartment: { select: { name: true, departmentId: true } },
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

  if (action === "approve" && crossAccess) {
    const departmentId = joinRequest.subDepartment?.departmentId
    if (!departmentId) {
      return NextResponse.json({ error: "Team has no department" }, { status: 400 })
    }
    await prisma.$transaction([
      (prisma.departmentAccess as any).upsert({
        where: { departmentId_userId: { departmentId, userId: joinRequest.userId } },
        create: { departmentId, userId: joinRequest.userId, grantedBy: profile.id },
        update: {},
      }),
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      }),
      prisma.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `approved: Your request to join ${joinRequest.subDepartment?.name ?? "the team"} was approved. You've been granted cross-department access.`,
        },
      }),
    ])
    return NextResponse.json({ ok: true })
  }

  if (action === "approve") {
    const trimmedName = nickname?.trim() || null

    await prisma.$transaction([
      (prisma.subDepartmentMembership as any).upsert({
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
      }),
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      }),
      // Set Profile.teamId if unset
      prisma.profile.updateMany({
        where: { id: joinRequest.userId, subDepartmentId: null },
        data: { subDepartmentId },
      }),
      prisma.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `approved: Your request to join ${joinRequest.subDepartment?.name ?? "the team"} was approved`,
        },
      }),
    ])
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
          message: `rejected: Your request to join ${joinRequest.subDepartment?.name ?? "the team"} was not approved`,
        },
      }),
    ])
  }

  return NextResponse.json({ ok: true })
}
