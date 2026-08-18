import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"

// GET /api/tickets/[id]/messages/[messageId] — fetch a single message (realtime delta append)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId, messageId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, subDepartmentId: true, assigneeId: true, creatorId: true, deletedAt: true, assignees: { select: { userId: true } }, subDepartment: { select: { departmentId: true } } },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: false })
  if (accessError) return accessError

  const m = await prisma.ticketMessage.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: { select: { id: true, storageUrl: true, fileName: true, fileSize: true } },
    },
  })
  if (!m || m.ticketId !== ticketId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    id: m.id,
    direction: m.direction,
    status: m.status,
    throttled: m.throttled,
    body: m.bodyHtml,
    fromName: m.fromName,
    fromEmail: m.fromEmail,
    authorId: m.author?.id ?? null,
    authorName: m.author?.name ?? null,
    authorAvatarUrl: m.author?.avatarUrl ?? null,
    createdAt: m.createdAt.toISOString(),
    attachments: m.attachments.map((a) => ({
      id: a.id,
      storageUrl: a.storageUrl,
      fileName: a.fileName,
      fileSize: a.fileSize,
    })),
  })
}

// DELETE /api/tickets/[id]/messages/[messageId] — staff deletes a chat message
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId, messageId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subDepartmentId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { departmentId: true } },
    },
  })
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: true })
  if (accessError) return accessError

  const message = await prisma.ticketMessage.findUnique({
    where: { id: messageId },
    select: { id: true, ticketId: true },
  })
  if (!message || message.ticketId !== ticketId) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  await prisma.ticketMessage.delete({ where: { id: messageId } })

  return new NextResponse(null, { status: 204 })
}
