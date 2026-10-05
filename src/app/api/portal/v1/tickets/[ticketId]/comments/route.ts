import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import {
  cleanString,
  enforcePortalRateLimit,
  portalJson,
  readPortalJson,
  requirePortalApiKey,
} from "@/lib/portal-api"
import { appendTicketEvent } from "@/lib/ticket-events"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ctx, error } = await requirePortalApiKey(request, { write: true })
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 60, "comment")
  if (limited) return limited
  const parsed = await readPortalJson(request)
  if (parsed.error) return parsed.error
  const commentBody = cleanString(parsed.data.body, 10_000)
  if (!commentBody) return portalJson({ error: "Comment body is required" }, { status: 400 })
  const { ticketId } = await params

  return runWithApiKeyScope(ctx, async () => {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        tenantId: ctx.tenantId,
        deletedAt: null,
        intake: { apiKeyId: ctx.keyId },
      },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        intake: { select: { submitterName: true, submitterEmail: true } },
        assignees: { select: { userId: true } },
      },
    })
    if (!ticket?.intake) return portalJson({ error: "Ticket not found" }, { status: 404 })

    // The profile relation remains the integration owner's system identity;
    // this visible prefix preserves the real requester attribution for staff.
    const storedBody = `[Portal — ${ticket.intake.submitterName}]\n${commentBody}`
    const comment = await prisma.comment.create({
      data: { ticketId, authorId: ctx.createdById, body: storedBody },
      select: { id: true, createdAt: true },
    })
    await appendTicketEvent(ticketId, ctx.createdById, "COMMENT_ADDED", {
      commentId: comment.id,
    })

    const recipients = new Set([
      ticket.assigneeId,
      ...ticket.assignees.map((assignee) => assignee.userId),
    ].filter((id): id is string => Boolean(id)))
    const snippet = commentBody.length > 140 ? `${commentBody.slice(0, 137)}...` : commentBody
    for (const recipientId of recipients) {
      createNotification({
        recipientId,
        actorId: ctx.createdById,
        type: "comment",
        ticketId,
        commentId: comment.id,
        message: snippet,
      }).catch(() => undefined)
    }

    return portalJson(
      {
        data: {
          id: comment.id,
          body: commentBody,
          createdAt: comment.createdAt,
          author: {
            name: ticket.intake.submitterName,
            email: ticket.intake.submitterEmail,
            type: "requester",
          },
        },
      },
      { status: 201 },
    )
  })
}
