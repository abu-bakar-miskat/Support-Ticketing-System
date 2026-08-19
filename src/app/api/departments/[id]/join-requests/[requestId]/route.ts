import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import type { Role } from "@/generated/prisma/enums"

// PATCH — admin/manager approves or rejects a department join request
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: departmentId, requestId } = await params

  const joinRequest = await prisma.joinRequest.findFirst({
    where: { id: requestId, departmentId },
    include: {
      user: { select: { name: true } },
      department: { select: { name: true } },
    },
  })
  if (!joinRequest) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (joinRequest.status !== "pending") {
    return NextResponse.json({ error: "Request already processed" }, { status: 409 })
  }

  const body = await req.json()
  const { action, subDepartmentId, role, nickname, fullAccess, projectIds, expiresAt, reason } = body as {
    action: "approve" | "reject"
    subDepartmentId?: string
    role?: string
    nickname?: string
    fullAccess?: boolean
    projectIds?: string[]
    expiresAt?: string
    reason?: string
  }

  const isCrossAccess = role === "cross-access"
  const effectiveRole: Role = (isCrossAccess ? "staff" : (role ?? "staff")) as Role
  const trimmedName = nickname?.trim() || null
  const deptName = joinRequest.department?.name ?? "the department"

  if (action === "approve") {
    if (isCrossAccess) {
      const isFullAccess = fullAccess === true

      await prisma.$transaction([
        (prisma.departmentAccess as any).upsert({
          where: { departmentId_userId: { departmentId, userId: joinRequest.userId } },
          create: {
            departmentId,
            userId: joinRequest.userId,
            grantedBy: profile.id,
            fullAccess: isFullAccess,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            reason: reason?.trim() || null,
          },
          update: {
            fullAccess: isFullAccess,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            reason: reason?.trim() || null,
            grantedAt: new Date(),
            grantedBy: profile.id,
          },
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
            message: `approved: Your request to join ${deptName} was approved. You've been granted cross-department access.`,
          },
        }),
      ])

      if (!isFullAccess && Array.isArray(projectIds) && projectIds.length > 0) {
        const validProjects = await prisma.project.findMany({
          where: {
            id: { in: projectIds },
            OR: [{ departmentId }, { subDepartment: { departmentId } }],
          },
          select: { id: true },
        })
        if (validProjects.length > 0) {
          await prisma.projectMember.createMany({
            data: validProjects.map((p) => ({ projectId: p.id, userId: joinRequest.userId })),
            skipDuplicates: true,
          })
        }
      }
    } else if (effectiveRole === "admin") {
      // Promote to global admin — no team assignment needed
      await prisma.$transaction([
        prisma.profile.update({
          where: { id: joinRequest.userId },
          data: { role: "admin" },
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
            message: `approved: Your request to join ${deptName} was approved. You've been granted Admin access.`,
          },
        }),
      ])
    } else if (effectiveRole === "manager") {
      // Assign as department manager — no team assignment needed
      await prisma.$transaction([
        (prisma.departmentManager as any).upsert({
          where: { departmentId_userId: { departmentId, userId: joinRequest.userId } },
          create: { departmentId, userId: joinRequest.userId, assignedBy: profile.id },
          update: {},
        }),
        // Upgrade role to manager if not already admin
        prisma.profile.updateMany({
          where: { id: joinRequest.userId, role: { not: "admin" } },
          data: { role: "manager" },
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
            message: `approved: Your request to join ${deptName} was approved. You've been assigned as Manager.`,
          },
        }),
      ])
    } else {
      // lead or staff — team assignment required
      if (!subDepartmentId) {
        return NextResponse.json({ error: "teamId is required for lead/staff roles" }, { status: 400 })
      }

      const subDepartment = await prisma.subDepartment.findFirst({
        where: { id: subDepartmentId, departmentId },
      })
      if (!subDepartment) return NextResponse.json({ error: "Team not found in this department" }, { status: 404 })

      const memberRole: Role = effectiveRole === "sub_manager" ? "sub_manager" : "staff"

      await prisma.$transaction([
        (prisma.subDepartmentMembership as any).upsert({
          where: { userId_subDepartmentId: { userId: joinRequest.userId, subDepartmentId } },
          create: { userId: joinRequest.userId, subDepartmentId, role: memberRole, nickname: trimmedName, isActive: true },
          update: { role: memberRole, nickname: trimmedName, isActive: true },
        }),
        prisma.joinRequest.update({
          where: { id: requestId },
          data: { status: "approved", subDepartmentId, processedAt: new Date(), processedBy: profile.id },
        }),
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
            message: `approved: Your request to join ${deptName} was approved. You've been added to ${subDepartment.name}.`,
          },
        }),
      ])
    }
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
          message: `rejected: Your request to join ${deptName} was not approved.`,
        },
      }),
    ])
  }

  // Mark all other admins/managers' notifications for this request as read in the DB,
  // and broadcast a realtime event so their UI updates immediately.
  await markOtherManagerNotificationsRead(requestId, profile.id).catch(() => undefined)
  await broadcastResolved(requestId, action, profile.id).catch(() => undefined)

  // Broadcast to the requesting user so their onboarding page reacts in real time
  if (action === "approve") {
    await broadcastApprovedToUser(joinRequest.userId, departmentId).catch(() => undefined)
  } else {
    await broadcastRejectedToUser(joinRequest.userId, departmentId).catch(() => undefined)
  }

  return NextResponse.json({ ok: true })
}

async function markOtherManagerNotificationsRead(requestId: string, processedById: string) {
  await prisma.notification.updateMany({
    where: {
      joinRequestId: requestId,
      recipientId: { not: processedById },
      readAt: null,
    },
    data: { readAt: new Date() },
  })
}

async function broadcastOnboardingEvent(
  userId: string,
  event: "join_request_approved" | "join_request_rejected",
  payload: Record<string, string>,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `onboarding-notifs:${userId}`, event, payload, private: false }],
    }),
  })
}

function broadcastApprovedToUser(userId: string, departmentId: string) {
  return broadcastOnboardingEvent(userId, "join_request_approved", { departmentId })
}

function broadcastRejectedToUser(userId: string, departmentId: string) {
  return broadcastOnboardingEvent(userId, "join_request_rejected", { departmentId })
}

async function broadcastResolved(
  requestId: string,
  action: "approve" | "reject",
  processedById: string,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  const otherRecipients = await prisma.notification.findMany({
    where: { joinRequestId: requestId, recipientId: { not: processedById } },
    select: { recipientId: true },
    distinct: ["recipientId"],
  })
  if (otherRecipients.length === 0) return

  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: otherRecipients.map(({ recipientId }) => ({
        topic: `user-notifs:${recipientId}`,
        event: "join_request_resolved",
        payload: { requestId, status: action === "approve" ? "approved" : "rejected" },
        private: false,
      })),
    }),
  })
}
