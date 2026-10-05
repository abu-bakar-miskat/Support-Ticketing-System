import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { enforcePortalRateLimit, requirePortalApiKey, portalJson } from "@/lib/portal-api"

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
        subDepartment: { select: { id: true, name: true, prefix: true, departmentId: true } },
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true, avatarUrl: true } },
        intake: { select: { id: true, submitterName: true, submitterEmail: true } },
        comments: {
          where: { deletedAt: null, messageId: null },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            body: true,
            createdAt: true,
            editedAt: true,
            author: { select: { name: true, avatarUrl: true } },
          },
        },
      },
    })
    if (!ticket) return portalJson({ error: "Ticket not found" }, { status: 404 })

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
        closedAt: ticket.closedAt,
        departmentId: ticket.subDepartment.departmentId,
        subDepartment: { id: ticket.subDepartment.id, name: ticket.subDepartment.name },
        project: ticket.project,
        assignee: ticket.assignee,
        submission: ticket.intake,
        comments: ticket.comments,
      },
    })
  })
}
