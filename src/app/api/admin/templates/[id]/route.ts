import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import { updateTemplate, archiveTemplate } from "@/lib/template-catalogue"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const template = await prisma.template.findUnique({ where: { id }, select: { id: true } })
  if (!template) return notFound("Template not found")

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  if (name === "") return badRequest("Name cannot be empty")

  const updated = await updateTemplate({
    id,
    name: name || undefined,
    description: "description" in body ? (body.description as string | null) : undefined,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
  })

  return NextResponse.json(updated)
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
