import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { avatarColorFor } from "@/lib/avatar"
import { timeAgo, isToday } from "@/lib/format"
import { getProfileDeptScope } from "@/lib/dept-scope"
import type { MentionItem } from "@/lib/api/mentions"

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  qa: "QA",
  support: "Support",
  viewer: "Viewer",
}

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const deptScope = await getProfileDeptScope(profile)

  const rows = await prisma.mention.findMany({
    where: {
      mentionedUserId: profile.id,
      ...(deptScope
        ? { comment: { ticket: { subDepartmentId: { in: deptScope.subDepartmentIds } } } }
        : {}),
    },
    include: {
      comment: {
        include: {
          author: { select: { name: true, role: true, avatarUrl: true } },
          ticket: {
            select: {
              id: true,
              title: true,
              ticketNumber: true,
              subDepartment: { select: { prefix: true } },
            },
          },
        },
      },
    },
    orderBy: { comment: { createdAt: "desc" } },
    take: 50,
  })

  const now = new Date()
  const mentions: MentionItem[] = rows
    .filter((m) => m.comment.deletedAt === null)
    .map((m) => {
      const author = m.comment.author
      const ticket = m.comment.ticket
      return {
        id: m.id,
        author: author.name,
        initials: author.name
          .split(/\s+/)
          .map((p: string) => p.charAt(0))
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        avatarColor: avatarColorFor(author.name),
        avatarUrl: author.avatarUrl ?? null,
        role: ROLE_LABEL[author.role] ?? author.role,
        ticketId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
        ticketDbId: ticket.id,
        ticketTitle: ticket.title,
        body: m.comment.body,
        time: timeAgo(m.comment.createdAt, now),
        unread: m.readAt === null,
        section: isToday(m.comment.createdAt, now) ? ("today" as const) : ("earlier" as const),
      }
    })

  return NextResponse.json({ mentions })
}
