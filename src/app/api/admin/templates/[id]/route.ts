import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import { updateTemplate, archiveTemplate, setTemplateFeatures } from "@/lib/template-catalogue"
import { TEMPLATE_FEATURE_KEYS, isTemplateFeatureKey } from "@/lib/template-features"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const template = await prisma.template.findUnique({ where: { id }, select: { id: true } })
  if (!template) return notFound("Template not found")

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  if (name === "") return badRequest("Name cannot be empty")

  if ("featureKeys" in body) {
    const featureKeys = Array.isArray(body.featureKeys) ? body.featureKeys : []
    if (!featureKeys.every(isTemplateFeatureKey)) {
      return badRequest(`featureKeys must only contain: ${TEMPLATE_FEATURE_KEYS.join(", ")}`)
    }
    await setTemplateFeatures(id, featureKeys)
  }

  const updated = await updateTemplate({
    id,
    name: name || undefined,
    description: "description" in body ? (body.description as string | null) : undefined,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
  })

  const withFeatures = await prisma.template.findUnique({
    where: { id: updated.id },
    include: { features: { select: { key: true } } },
  })

  return NextResponse.json(withFeatures)
}

// Archive a template (isActive: false) rather than deleting it — existing
// TenantTemplate grants keep working, it just disappears from the catalogue
// for new requests. Use archiveTemplate directly instead of a hard delete so
// TenantTemplate/TemplateRequest history is preserved.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const template = await prisma.template.findUnique({ where: { id }, select: { id: true } })
  if (!template) return notFound("Template not found")

  await archiveTemplate(id)
  return NextResponse.json({ ok: true })
}
