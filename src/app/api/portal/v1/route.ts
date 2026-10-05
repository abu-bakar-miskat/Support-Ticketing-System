import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { requirePortalApiKey, portalJson } from "@/lib/portal-api"

export async function GET(request: NextRequest) {
  const { ctx, error } = await requirePortalApiKey(request)
  if (error) return error

  return runWithApiKeyScope(ctx, async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    })

    return portalJson({
      name: "Support Portal API",
      version: "v1",
      tenantId: ctx.tenantId,
      tenantName: tenant?.name ?? null,
    endpoints: {
      form: "GET /api/portal/v1/form",
      submit: "POST /api/portal/v1/form/submissions",
        submissions: "GET /api/portal/v1/submissions?email={email}",
        submission: "GET /api/portal/v1/submissions/{submissionId}",
        ticket: "GET /api/portal/v1/tickets/{ticketId}",
        comment: "POST /api/portal/v1/tickets/{ticketId}/comments",
      },
    })
  })
}
