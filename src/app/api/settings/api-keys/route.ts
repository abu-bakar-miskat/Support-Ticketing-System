import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"
import { prisma } from "@/lib/db"
import { generateApiKey } from "@/lib/api-key-auth"
import { assertTemplateFeatureEnabled } from "@/lib/template-catalogue"
import type { ApiKeyScope } from "@/generated/prisma/enums"
import { Prisma } from "@/generated/prisma/client"

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
  const { name, departmentId, purpose, formConfigId } = body as {
    name?: string
    departmentId?: string
    purpose?: string
    formConfigId?: string
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

  let resolvedFormId: string | null = null
  if (purpose === "portal") {
    if (!tenantAdmin) {
      return NextResponse.json({ error: "Only tenant admins can create portal keys" }, { status: 403 })
    }
    if (!resolvedDeptId || !formConfigId?.trim()) {
      return NextResponse.json(
        { error: "Department and support form are required" },
        { status: 400 },
      )
    }
    const form = await prisma.intakeFormConfig.findFirst({
      where: {
        id: formConfigId.trim(),
        departmentId: resolvedDeptId,
        department: { tenantId },
      },
      select: { id: true, isActive: true, apiKey: { select: { id: true } } },
    })
    if (!form) {
      return NextResponse.json({ error: "Support form not found in this department" }, { status: 404 })
    }
    if (!form.isActive) {
      return NextResponse.json({ error: "Select an active support form" }, { status: 409 })
    }
    if (form.apiKey) {
      return NextResponse.json({ error: "This support form is already connected to an API key" }, { status: 409 })
    }
    resolvedFormId = form.id
  }

  const { raw, hashed, suffix } = generateApiKey()

  let key
  try {
    key = await prisma.apiKey.create({
      data: {
        name: name.trim(),
        keySuffix: suffix,
        hashedKey: hashed,
        scope: (purpose === "portal" ? "read_write" : "read") as ApiKeyScope,
        kind: purpose === "portal" ? "portal" : "general",
        tenantId,
        // Portal keys stay tenant-wide. The submitted department only verifies
        // the selected form and is not an authorization boundary for the key.
        departmentId: purpose === "portal" ? null : resolvedDeptId,
        formConfigId: purpose === "portal" ? resolvedFormId : null,
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
  } catch (cause) {
    if (
      purpose === "portal" &&
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This support form is already connected to an API key" },
        { status: 409 },
      )
    }
    throw cause
  }

  // Return the raw key only at creation time — never stored
  return NextResponse.json({ ...key, rawKey: raw }, { status: 201 })
}
