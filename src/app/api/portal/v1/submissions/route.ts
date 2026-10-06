import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { isValidEmailFormat } from "@/lib/email-validation"
import { enforcePortalRateLimit, requirePortalApiKey, portalJson } from "@/lib/portal-api"
import { toSubmissionJson } from "@/lib/portal-submissions"

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
        formConfig: { select: { id: true, name: true } },
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            category: true,
            status: true,
            updatedAt: true,
            subDepartment: {
              select: {
                id: true,
                name: true,
                prefix: true,
                department: { select: { id: true, name: true } },
              },
            },
            activityLogs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
    })
    return portalJson({ data: submissions.map(toSubmissionJson) })
  })
}
