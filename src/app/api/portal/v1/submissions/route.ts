import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { isValidEmailFormat } from "@/lib/email-validation"
import { enforcePortalRateLimit, requirePortalApiKey, portalJson } from "@/lib/portal-api"

export async function GET(request: NextRequest) {
  const { ctx, error } = await requirePortalApiKey(request)
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 60, "submissions")
  if (limited) return limited
  const email = (request.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase()
  if (!isValidEmailFormat(email)) {
    return portalJson({ error: "A valid email query parameter is required" }, { status: 400 })
  }

  return runWithApiKeyScope(ctx, async () => {
    const submissions = await prisma.intake.findMany({
      where: {
        apiKeyId: ctx.keyId,
        submitterEmail: { equals: email, mode: "insensitive" },
        formConfig: { department: { tenantId: ctx.tenantId } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        submitterName: true,
        submitterEmail: true,
        responses: true,
        createdAt: true,
        formConfig: { select: { id: true, name: true, departmentId: true } },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            subDepartment: { select: { prefix: true } },
          },
        },
      },
    })
    return portalJson({ data: submissions.map(toSubmissionJson) })
  })
}

export function toSubmissionJson(submission: {
  id: string
  submitterName: string
  submitterEmail: string
  responses: unknown
  createdAt: Date
  formConfig: { id: string; name: string; departmentId: string }
  ticket: null | {
    id: string
    ticketNumber: number
    title: string
    status: string
    subDepartment: { prefix: string }
  }
}) {
  return {
    id: submission.id,
    submitterName: submission.submitterName,
    submitterEmail: submission.submitterEmail,
    responses: Array.isArray(submission.responses)
      ? submission.responses.filter((item) => !(item && typeof item === "object" && "_ikey" in item))
      : submission.responses,
    createdAt: submission.createdAt,
    form: submission.formConfig,
    ticket: submission.ticket
      ? {
          id: submission.ticket.id,
          reference: `${submission.ticket.subDepartment.prefix}-${submission.ticket.ticketNumber}`,
          title: submission.ticket.title,
          status: submission.ticket.status,
        }
      : null,
  }
}
