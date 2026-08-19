import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import { TEMPLATE_FEATURE_KEYS, isTemplateFeatureKey } from "@/lib/template-features"
import { setTemplateFeatures } from "@/lib/template-catalogue"

// Replace the full feature-key set for a template.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const template = await prisma.template.findUnique({ where: { id }, select: { id: true } })
  if (!template) return notFound("Template not found")

  const body = await request.json().catch(() => ({}))
  const featureKeys = Array.isArray(body.featureKeys) ? body.featureKeys : []
  if (!featureKeys.every(isTemplateFeatureKey)) {
    return badRequest(`featureKeys must only contain: ${TEMPLATE_FEATURE_KEYS.join(", ")}`)
  }

  await setTemplateFeatures(id, featureKeys)
  return NextResponse.json({ ok: true })
}
