import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { notFound } from "@/lib/api-response"
import { revokeTemplateFromTenant } from "@/lib/template-catalogue"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id: tenantId, templateId } = await params
  const grant = await prisma.tenantTemplate.findUnique({
    where: { tenantId_templateId: { tenantId, templateId } },
    select: { id: true },
  })
  if (!grant) return notFound("This tenant does not have that template")

  await revokeTemplateFromTenant({ tenantId, templateId, actorId: profile!.id })
  return NextResponse.json({ ok: true })
}
