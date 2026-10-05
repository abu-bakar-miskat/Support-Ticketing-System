import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"
import { prisma } from "@/lib/db"
import { generateApiKey } from "@/lib/api-key-auth"
import { assertTemplateFeatureEnabled } from "@/lib/template-catalogue"
import type { ApiKeyScope } from "@/generated/prisma/enums"

// GET /api/settings/api-keys — list keys visible to the caller
export async function GET() {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const tenantId = profile.activeTenantId ?? "__no_tenant__"
  const tenantAdmin = isActiveTenantAdmin(profile)
  const keys = await prisma.apiKey.findMany({
    where: tenantAdmin
      ? { OR: [{ tenantId }, { tenantId: null, department: { tenantId } }] }
      : { departmentId: { in: profile.departmentAdminIds ?? [] } },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      keySuffix: true,
      scope: true,
      departmentId: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      department: { select: { name: true } },
    },
  })

  return NextResponse.json(keys)
}

// POST /api/settings/api-keys — create a new key
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { name, departmentId, purpose, formName } = body as {
    name?: string
    departmentId?: string
    purpose?: string
    formName?: string
  }

  if (purpose !== "portal") {
    const featureCheck = await assertTemplateFeatureEnabled(profile.activeTenantId ?? "__no_tenant__", "apiKeys")
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 })
    }
  }

  if (!name?.trim() || name.trim().length > 100) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const tenantId = profile.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 400 })
  }

  const resolvedDeptId: string | null = departmentId ?? null
  const tenantAdmin = isActiveTenantAdmin(profile)
  if (!resolvedDeptId && !tenantAdmin) {
    return NextResponse.json({ error: "Only tenant admins can create tenant-wide keys" }, { status: 403 })
  }
  if (resolvedDeptId) {
    const department = await prisma.department.findFirst({
      where: { id: resolvedDeptId, tenantId },
      select: { id: true },
    })
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 })
    }
    if (!tenantAdmin && !(profile.departmentAdminIds ?? []).includes(resolvedDeptId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (purpose === "portal" && resolvedDeptId) {
    return NextResponse.json(
      { error: "Portal keys must be tenant-wide" },
      { status: 400 },
    )
  }

  let resolvedFormDepartmentId: string | null = null
  if (purpose === "portal") {
    if (!tenantAdmin) {
      return NextResponse.json({ error: "Only tenant admins can create portal keys" }, { status: 403 })
    }
    const formDepartment = await prisma.department.findFirst({
      where: { tenantId },
      orderBy: { id: "asc" },
      select: { id: true },
    })
    if (!formDepartment) {
      return NextResponse.json({ error: "Create a department before generating a portal key" }, { status: 409 })
    }
    // IntakeFormConfig is still department-backed internally for compatibility
    // with the shared form builder. Portal routing is tenant-wide and is chosen
    // independently on each issue; the API key itself remains departmentless.
    resolvedFormDepartmentId = formDepartment.id
  }

  const { raw, hashed, suffix } = generateApiKey()

  const key = await prisma.$transaction(async (tx) => {
    const form = purpose === "portal" && resolvedFormDepartmentId
      ? await tx.intakeFormConfig.create({
          data: {
            name: formName?.trim().slice(0, 120) || `${name.trim()} Support Form`,
            departmentId: resolvedFormDepartmentId,
            intakeSubDepartmentId: null,
            scope: "DEPARTMENT",
            assignmentMethod: "ROUND_ROBIN",
          },
          select: { id: true, name: true },
        })
      : null

    return tx.apiKey.create({
      data: {
        name: name.trim(),
        keySuffix: suffix,
        hashedKey: hashed,
        scope: (purpose === "portal" ? "read_write" : "read") as ApiKeyScope,
        kind: purpose === "portal" ? "portal" : "general",
        tenantId,
        departmentId: resolvedDeptId,
        formConfigId: form?.id ?? null,
        createdById: profile.id,
      },
      select: {
        id: true,
        name: true,
        keySuffix: true,
        scope: true,
        departmentId: true,
        formConfigId: true,
        createdAt: true,
        department: { select: { name: true } },
        formConfig: { select: { id: true, name: true } },
      },
    })
  })

  // Return the raw key only at creation time — never stored
  return NextResponse.json({ ...key, rawKey: raw }, { status: 201 })
}
