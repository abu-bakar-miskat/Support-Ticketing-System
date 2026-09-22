import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { enableTemplateForTenant } from "@/lib/template-catalogue"
import { getPlatformSettings } from "@/lib/platform-settings"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const tenantId = profile.activeTenantId
  if (!tenantId) return badRequest("No active tenant")

  const { id: templateId } = await params
  const { templateEnablementRequiresApproval } = await getPlatformSettings()

  try {
    const result = await enableTemplateForTenant({
      tenantId,
      templateId,
      actorId: profile.id,
      approvalRequired: templateEnablementRequiresApproval,
    })
    return NextResponse.json(result, { status: result.status === "requested" ? 201 : 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 })
  }
}
