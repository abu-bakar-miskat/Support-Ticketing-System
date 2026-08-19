import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { TEMPLATE_FEATURE_KEYS, isTemplateFeatureKey } from "@/lib/template-features"
import { createTemplate } from "@/lib/template-catalogue"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// List every template in the catalogue (super-admin only), including archived
// ones (isActive: false) so the catalogue-management UI can reactivate them.
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const templates = await prisma.template.findMany({
    orderBy: { order: "asc" },
    include: {
      features: { select: { key: true } },
      _count: { select: { tenantTemplates: { where: { status: "ACTIVE" } } } },
    },
  })
  return NextResponse.json(templates)
}

// Create a new template with an initial set of gated feature keys.
export async function POST(request: NextRequest) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  if (!name) return badRequest("Name is required")

  const slug = ((body.slug as string | undefined)?.trim() || slugify(name)).toLowerCase()
  if (!slug) return badRequest("Could not derive a slug from the name")

  const featureKeys = Array.isArray(body.featureKeys) ? body.featureKeys : []
  if (!featureKeys.every(isTemplateFeatureKey)) {
    return badRequest(`featureKeys must only contain: ${TEMPLATE_FEATURE_KEYS.join(", ")}`)
  }

  const existing = await prisma.template.findUnique({ where: { slug }, select: { id: true } })
  if (existing) return NextResponse.json({ error: "A template with that slug already exists" }, { status: 409 })

  const template = await createTemplate({
    name,
    slug,
    description: (body.description as string | undefined)?.trim() || undefined,
    featureKeys,
    createdById: profile!.id,
  })

  return NextResponse.json(template, { status: 201 })
}
