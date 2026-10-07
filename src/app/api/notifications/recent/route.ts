import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { timeAgo } from "@/lib/format"
import { ticketPayloadInScope, resolveNotificationScope, joinRequestInDeptScope } from "@/lib/notification-scope"
import { countUnreadNotifications } from "@/lib/dashboard-badges-data"
import { runAsSystem } from "@/lib/request-scope"

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  // Department-scoped to the caller's active department (see resolveNotificationScope).
  const { allowedSubDepartmentIds, activeDeptId } = await resolveNotificationScope(profile)

  const [rows, unreadCount] = await Promise.all([prisma.notification.findMany({
    where: { recipientId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      actor: { select: { name: true, avatarUrl: true } },
      ticket: {
        select: {
          id: true,
          title: true,
          ticketNumber: true,
          subDepartmentId: true,
          subDepartment: { select: { prefix: true } },
        },
      },
      joinRequest: {
        select: { id: true, status: true, departmentId: true },
      },
    },
  }),
  // Same query as the bell badge, so the panel header and badge always agree
  // (unread among the 10 rows shown would undercount).
  runAsSystem(() => countUnreadNotifications(profile.id, allowedSubDepartmentIds ?? undefined, activeDeptId)),
  ])

  const now = new Date()

  const items = rows
    .filter((n) =>
      n.type === "join_request"
        ? joinRequestInDeptScope(n.joinRequest?.departmentId ?? null, activeDeptId)
        : ticketPayloadInScope(n.ticket, allowedSubDepartmentIds),
    )
    .map((n) => ({
    id: n.id,
    type: n.type,
    actorName: n.actor?.name ?? "System",
    actorAvatarUrl: n.actor?.avatarUrl ?? null,
    message: n.message ?? null,
    unread: n.readAt === null,
    time: timeAgo(n.createdAt, now),
    ticket: n.ticket
      ? {
          dbId: n.ticket.id,
          humanId: `${n.ticket.subDepartment.prefix}-${n.ticket.ticketNumber}`,
          title: n.ticket.title,
        }
      : null,
    joinRequest: n.joinRequest
      ? { id: n.joinRequest.id, status: n.joinRequest.status }
      : null,
  }))

  return NextResponse.json({ items, unreadCount })
}
