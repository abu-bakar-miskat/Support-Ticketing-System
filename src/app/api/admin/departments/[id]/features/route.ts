import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import { TEMPLATE_FEATURE_KEYS, isTemplateFeatureKey } from "@/lib/template-features"

type Params = { params: Promise<{ id: string }> }

// Super Admin control over any department's feature allowlist, in any tenant.
// A department's effective features gate its settings + sidebar (and thus its
// sub-departments) via getDepartmentActiveFeatureKeys.

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const dept = await prisma.department.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      templateSlug: true,
      featureKeys: true,
      tenant: { select: { id: true, name: true } },
    },
  })
  if (!dept) return notFound("Department not found")

  const raw = dept.featureKeys
  const controlled = raw != null
  const featureKeys = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []

  return NextResponse.json({
    departmentId: dept.id,
    name: dept.name,
    tenant: dept.tenant,
    templateSlug: dept.templateSlug,
    // false = uncontrolled (every feature visible); true = only `featureKeys`.
    controlled,
    featureKeys,
    allKeys: TEMPLATE_FEATURE_KEYS,
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const dept = await prisma.department.findUnique({ where: { id }, select: { id: true, tenantId: true } })
  if (!dept) return notFound("Department not found")

  const body = await req.json().catch(() => ({}))

  // Clear control → every feature visible again (fail-open).
  if (body.featureKeys === null || body.controlled === false) {
    await prisma.department.update({ where: { id }, data: { featureKeys: Prisma.JsonNull } })
    return NextResponse.json({ controlled: false, featureKeys: [] })
  }

  const raw: unknown[] | null = Array.isArray(body.featureKeys) ? body.featureKeys : null
  if (!raw) {
    return badRequest("featureKeys must be an array of feature keys, or null to remove control")
  }
  // Grant/revoke = replace with exactly this validated, de-duplicated set.
  const keys: string[] = [...new Set(raw.filter(isTemplateFeatureKey))]
  await prisma.department.update({ where: { id }, data: { featureKeys: keys } })

  return NextResponse.json({ controlled: true, featureKeys: keys })
}
