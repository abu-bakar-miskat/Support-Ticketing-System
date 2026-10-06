import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { enforcePortalRateLimit, requirePortalApiKey, portalJson } from "@/lib/portal-api"
import { presentPortalComment } from "@/lib/portal-comments"
import { latestPortalActivityAt } from "@/lib/portal-submissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ctx, error } = await requirePortalApiKey(request)
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 120, "ticket")
  if (limited) return limited
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
        ticketNumber: true,
        title: true,
        description: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        subDepartment: {
          select: {
            id: true,
            name: true,
            prefix: true,
            department: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true, avatarUrl: true } },
        intake: { select: { id: true, submitterName: true, submitterEmail: true } },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        comments: {
          where: { deletedAt: null, messageId: null },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            body: true,
            parentId: true,
            createdAt: true,
            editedAt: true,
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    })
    if (!ticket?.intake) return portalJson({ error: "Ticket not found" }, { status: 404 })
    const intake = ticket.intake

    return portalJson({
      data: {
        id: ticket.id,
        reference: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        type: ticket.type,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        lastActivityAt: latestPortalActivityAt(
          ticket.updatedAt,
          ticket.activityLogs[0]?.createdAt,
        ),
        closedAt: ticket.closedAt,
        departmentId: ticket.subDepartment.department.id,
        department: ticket.subDepartment.department,
        subDepartment: { id: ticket.subDepartment.id, name: ticket.subDepartment.name },
        project: ticket.project,
        assignee: ticket.assignee,
        submission: intake,
        comments: ticket.comments.map((comment) => {
          const displayed = presentPortalComment({
            body: comment.body,
            authorId: comment.author.id,
            apiKeyCreatedById: ctx.createdById,
            submitterName: intake.submitterName,
          })
          return {
            id: comment.id,
            body: displayed.body,
            createdAt: comment.createdAt,
            editedAt: comment.editedAt,
            parentId: comment.parentId,
            visibility: displayed.visibility,
            author: displayed.isPortalRequester
              ? { name: intake.submitterName, avatarUrl: null, type: "requester" }
              : { name: comment.author.name, avatarUrl: comment.author.avatarUrl, type: "staff" },
          }
        }),
      },
    })
  })
}
