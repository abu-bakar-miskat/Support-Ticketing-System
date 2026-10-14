import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest, notFound } from "@/lib/api-response"
import {
  MARKETPLACE_FEATURE_KEYS,
  grantedMarketplaceFeatures,
  isMarketplaceFeatureKey,
} from "@/lib/template-features"

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

  const granted = grantedMarketplaceFeatures(dept.featureKeys)
  const featureKeys = granted === "ALL" ? [...MARKETPLACE_FEATURE_KEYS] : granted

  return NextResponse.json({
    departmentId: dept.id,
    name: dept.name,
    tenant: dept.tenant,
    templateSlug: dept.templateSlug,
    // Legacy null allowlist: every marketplace feature is already on.
    unrestricted: granted === "ALL",
    featureKeys,
    allKeys: MARKETPLACE_FEATURE_KEYS,
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const dept = await prisma.department.findUnique({ where: { id }, select: { id: true, tenantId: true } })
  if (!dept) return notFound("Department not found")

  const body = await req.json().catch(() => ({}))

  const raw: unknown[] | null = Array.isArray(body.featureKeys) ? body.featureKeys : null
  if (!raw) {
    return badRequest("featureKeys must be an array of marketplace feature keys")
  }
  // Only the marketplace set is opt-in. Anything else is always available
  // and is not stored on the department.
  const keys = [...new Set(raw.filter(isMarketplaceFeatureKey))]
  await prisma.department.update({ where: { id }, data: { featureKeys: keys } })

  return NextResponse.json({ unrestricted: false, featureKeys: keys })
}
