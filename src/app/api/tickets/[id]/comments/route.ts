import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { processMentions, resolveMentionedProfiles } from "@/lib/mentions"
import { createNotification } from "@/lib/notify"
import { appendTicketEvent } from "@/lib/ticket-events"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: ticketId } = await params

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      teamId: true,
      projectId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      assignees: { select: { userId: true } },
      team: { select: { departmentId: true } },
    },
  })
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }
  if (ticket.deletedAt) {
    return NextResponse.json({ error: "Ticket has been deleted" }, { status: 409 })
  }
  // Anyone who can view the ticket can comment/reply (view-level access, not the
  // stricter edit/assignee gate).
  const accessError = await assertTicketAccess(profile, ticket)
  if (accessError) return accessError

  const body = await request.json().catch(() => ({}))
  const commentBody = typeof body.body === "string" ? body.body.trim() : ""
  const attachmentIds: string[] =
    Array.isArray(body.attachments)
      ? body.attachments.filter((id: unknown) => typeof id === "string")
      : []
  const hasAttachment = body.hasAttachment === true || attachmentIds.length > 0
  if (!commentBody && !hasAttachment) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 })
  }
  const parentId = typeof body.parentId === "string" ? body.parentId : null
  const messageId = typeof body.messageId === "string" ? body.messageId : null

  // Internal note attached to a specific customer email message. Staff-only and
  // never emailed to the customer. Supports @mentions (with notifications) like
  // a comment, but no attachments or activity-log entry.
  if (messageId) {
    if (!commentBody) {
      return NextResponse.json({ error: "Note body is required" }, { status: 400 })
    }
    const message = await prisma.ticketMessage.findFirst({
      where: { id: messageId, ticketId },
      select: { id: true },
    })
    if (!message) {
      return NextResponse.json(
        { error: "Message not found for this ticket" },
        { status: 400 },
      )
    }
    const note = await prisma.comment.create({
      data: { ticketId, authorId: profile.id, body: commentBody, messageId },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    })
    processMentions({
      commentId: note.id,
      ticketId,
      actorId: profile.id,
      actorName: profile.name,
      body: commentBody,
      ticketTitle: ticket.title,
    }).catch(() => undefined)
    return NextResponse.json({ ...note, attachments: [] }, { status: 201 })
  }

  let pendingAttachments: Array<{
    id: string
    storageUrl: string
    fileName: string
    fileSize: number
  }> = []
  if (attachmentIds.length > 0) {
    pendingAttachments = await prisma.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        uploaderProfileId: profile.id,
        commentId: null,
        status: "temporary",
      },
      select: { id: true, storageUrl: true, fileName: true, fileSize: true },
    })
    if (pendingAttachments.length !== attachmentIds.length) {
      return NextResponse.json(
        { error: "One or more attachments cannot be added to this comment" },
        { status: 400 },
      )
    }
  }

  const comment = await prisma.comment.create({
    data: { ticketId, authorId: profile.id, body: commentBody, parentId },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  })

  // Write event to ActivityLog and broadcast to ticket-activity:{ticketId} so
  // every user currently viewing this ticket receives the update in real-time.
  await appendTicketEvent(ticketId, profile.id, "COMMENT_ADDED", {
    commentId: comment.id,
    ...(parentId ? { parentId } : {}),
  })

  if (pendingAttachments.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: pendingAttachments.map((a) => a.id) } },
      data: { ticketId, commentId: comment.id, status: "attached" },
    })

    await Promise.all(
      pendingAttachments.map((attachment) =>
        prisma.activityLog.create({
          data: {
            ticketId,
            actorId: profile.id,
            action: "ATTACHMENT_ADDED",
            metadata: {
              fileName: attachment.fileName,
              attachmentId: attachment.id,
              storageUrl: attachment.storageUrl,
              commentId: comment.id,
            },
          },
        }),
      ),
    )
  }

  const mentionedProfiles = await resolveMentionedProfiles(commentBody, ticketId)
  const mentionedIds = new Set(mentionedProfiles.map((p) => p.id))

  processMentions({
    commentId: comment.id,
    ticketId,
    actorId: profile.id,
    actorName: profile.name,
    body: commentBody,
    ticketTitle: ticket.title,
  }).catch(() => undefined)

  const snippet = commentBody.length > 140 ? `${commentBody.slice(0, 137)}...` : commentBody

  const assigneeIds = ticket.assignees.map((a) => a.userId)
  const commentRecipients = new Set([
    ticket.creatorId,
    ticket.assigneeId,
    ...assigneeIds,
  ].filter(Boolean) as string[])

  for (const recipientId of commentRecipients) {
    if (mentionedIds.has(recipientId)) continue
    createNotification({
      recipientId,
      actorId: profile.id,
      type: "comment",
      ticketId,
      commentId: comment.id,
      message: snippet,
    }).catch(() => undefined)
  }

  return NextResponse.json(
    {
      ...comment,
      attachments: pendingAttachments,
    },
    { status: 201 },
  )
}
