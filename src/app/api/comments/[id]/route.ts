import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/app/api/admin/_guard"
import { prisma } from "@/lib/db"
import { processMentions } from "@/lib/mentions"
import { assertTicketAccess } from "@/lib/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  void profile

  const { id } = await params
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      attachments: { select: { id: true, storageUrl: true, fileName: true, fileSize: true } },
      ticket: {
        select: {
          id: true, tenantId: true, teamId: true, projectId: true, assigneeId: true, creatorId: true, deletedAt: true,
          team: { select: { departmentId: true } },
        },
      },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          attachments: { select: { id: true, storageUrl: true, fileName: true, fileSize: true } },
        },
      },
    },
  })
  if (!comment) return NextResponse.json(null, { status: 404 })

  const accessError = await assertTicketAccess(profile, comment.ticket)
  if (accessError) return accessError

  return NextResponse.json({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    messageId: comment.messageId ?? null,
    authorId: comment.author.id,
    authorName: comment.author.name,
    authorAvatarUrl: comment.author.avatarUrl ?? null,
    attachments: comment.attachments.map((a) => ({ id: a.id, storageUrl: a.storageUrl, fileName: a.fileName, fileSize: a.fileSize })),
    replies: comment.replies.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      authorId: r.author.id,
      authorName: r.author.name,
      authorAvatarUrl: r.author.avatarUrl ?? null,
      attachments: r.attachments.map((a) => ({ id: a.id, storageUrl: a.storageUrl, fileName: a.fileName, fileSize: a.fileSize })),
      replies: [],
    })),
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const comment = await prisma.comment.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      deletedAt: true,
      ticketId: true,
      ticket: { select: { title: true } },
      mentions: { select: { mentionedUserId: true, notifiedAt: true } },
    },
  })
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 })
  }
  if (comment.authorId !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (comment.deletedAt) {
    return NextResponse.json({ error: "Cannot edit a deleted comment" }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const newBody = typeof body.body === "string" ? body.body.trim() : ""
  if (!newBody) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 })
  }

  const updated = await prisma.comment.update({
    where: { id },
    data: { body: newBody, editedAt: new Date() },
    select: { id: true, body: true, editedAt: true },
  })

  // Only pass IDs of users who have already been notified so they don't get re-emailed
  const alreadyNotifiedIds = comment.mentions
    .filter((m) => m.notifiedAt !== null)
    .map((m) => m.mentionedUserId)

  processMentions({
    commentId: id,
    ticketId: comment.ticketId,
    actorId: profile.id,
    body: newBody,
    ticketTitle: comment.ticket.title,
    alreadyNotifiedIds,
  }).catch(() => undefined)

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const comment = await prisma.comment.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  })
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 })
  }
  if (comment.authorId !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.comment.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
