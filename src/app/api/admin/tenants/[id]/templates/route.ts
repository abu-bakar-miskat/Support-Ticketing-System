import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import { grantTemplateToTenant } from "@/lib/template-catalogue"

// Direct Super Admin grant, bypassing the tenant-initiated request flow.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id: tenantId } = await params
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) return notFound("Tenant not found")

  const body = await request.json().catch(() => ({}))
  const templateId = body.templateId as string | undefined
  if (!templateId) return badRequest("templateId is required")

  const template = await prisma.template.findUnique({ where: { id: templateId }, select: { id: true } })
  if (!template) return notFound("Template not found")

  await grantTemplateToTenant({ tenantId, templateId, actorId: profile!.id })
  return NextResponse.json({ ok: true }, { status: 201 })
}
