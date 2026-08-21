import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

// POST /api/tickets/[id]/messages/[messageId]/reject
// Discards a quarantined inbound message instead of promoting it to trusted.
// Same permission model as accept: the ticket assignee or a department
// manager of the ticket's department.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId, messageId } = await params

  const message = await prisma.ticketMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      ticketId: true,
      status: true,
      ticket: {
        select: {
          id: true,
          assigneeId: true,
          assignees: { select: { userId: true } },
          subDepartment: { select: { departmentId: true } },
        },
      },
    },
  })

  if (!message || message.ticketId !== ticketId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  if (message.status !== "quarantined") {
    return NextResponse.json({ error: "Message is not quarantined" }, { status: 409 })
  }

  const assigneeIds = new Set([
    message.ticket.assigneeId,
    ...message.ticket.assignees.map((a) => a.userId),
  ])
  const isAssignee = assigneeIds.has(profile.id)

  let isDeptManager = false
  if (!isAssignee) {
    const managerRow = await prisma.departmentManager.findFirst({
      where: {
        departmentId: message.ticket.subDepartment.departmentId,
        userId: profile.id,
      },
      select: { userId: true },
    })
    isDeptManager = managerRow !== null
  }

  if (!isAssignee && !isDeptManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Detach any notes/attachments filed against this message before deleting
  // it, rather than relying on the FK's default referential action.
  await prisma.$transaction([
    prisma.comment.updateMany({ where: { messageId }, data: { messageId: null } }),
    prisma.attachment.updateMany({ where: { messageId }, data: { messageId: null } }),
    prisma.ticketMessage.delete({ where: { id: messageId } }),
  ])

  return NextResponse.json({ ok: true })
}
