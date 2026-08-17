import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { timeAgo } from "@/lib/format"

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const rows = await prisma.notification.findMany({
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
          team: { select: { prefix: true } },
        },
      },
      joinRequest: {
        select: { id: true, status: true, departmentId: true },
      },
    },
  })

  const now = new Date()

  const items = rows.map((n) => ({
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
          humanId: `${n.ticket.team.prefix}-${n.ticket.ticketNumber}`,
          title: n.ticket.title,
        }
      : null,
    joinRequest: n.joinRequest
      ? { id: n.joinRequest.id, status: n.joinRequest.status }
      : null,
  }))

  return NextResponse.json(items)
}
