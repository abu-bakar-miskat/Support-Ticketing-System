import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { enforcePortalRateLimit, requirePortalApiKey, portalJson } from "@/lib/portal-api"
import { toSubmissionJson } from "../route"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { ctx, error } = await requirePortalApiKey(request)
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 120, "submission")
  if (limited) return limited
  const { submissionId } = await params

  return runWithApiKeyScope(ctx, async () => {
    const submission = await prisma.intake.findFirst({
      where: {
        id: submissionId,
        apiKeyId: ctx.keyId,
        formConfig: { department: { tenantId: ctx.tenantId } },
      },
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
    if (!submission) return portalJson({ error: "Submission not found" }, { status: 404 })
    return portalJson({ data: toSubmissionJson(submission) })
  })
}
