import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { requestTemplate } from "@/lib/template-catalogue"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const tenantId = profile.activeTenantId
  if (!tenantId) return badRequest("No active tenant")

  const { id: templateId } = await params
  const body = await request.json().catch(() => ({}))

  try {
    const result = await requestTemplate({
      tenantId,
      templateId,
      requestedById: profile.id,
      message: (body.message as string | undefined)?.trim() || undefined,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 })
  }
}
