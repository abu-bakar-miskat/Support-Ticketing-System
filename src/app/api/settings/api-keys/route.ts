import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateApiKey } from "@/lib/api-key-auth"
import type { ApiKeyScope } from "@/generated/prisma/enums"

// GET /api/settings/api-keys — list keys visible to the caller
export async function GET() {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const where = isAdmin
    ? { department: { tenantId: profile.activeTenantId ?? "__no_tenant__" } }
    : { departmentId: { in: [...(profile as any).managedDepartmentIds ?? []] } }

  const keys = await prisma.apiKey.findMany({
    where,
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
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { name, departmentId } = body as { name?: string; departmentId?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Managers can only create keys for their own departments
  if (!isAdmin && departmentId) {
    const managed: string[] = (profile as any).managedDepartmentIds ?? []
    if (!managed.includes(departmentId)) {
      return NextResponse.json(
        { error: "You can only create keys for departments you manage" },
        { status: 403 },
      )
    }
  }

  // Managers must scope keys to a department; derive it if not provided
  let resolvedDeptId: string | null = departmentId ?? null
  if (!isAdmin && !resolvedDeptId) {
    const managed: string[] = (profile as any).managedDepartmentIds ?? []
    resolvedDeptId = managed[0] ?? null
    if (!resolvedDeptId) {
      return NextResponse.json(
        { error: "You must belong to a department to create an API key" },
        { status: 400 },
      )
    }
  }

  const { raw, hashed, suffix } = generateApiKey()

  const key = await prisma.apiKey.create({
    data: {
      name: name.trim(),
      keySuffix: suffix,
      hashedKey: hashed,
      scope: "read" as ApiKeyScope,
      departmentId: resolvedDeptId,
      createdById: profile.id,
    },
    select: {
      id: true,
      name: true,
      keySuffix: true,
      scope: true,
      departmentId: true,
      createdAt: true,
      department: { select: { name: true } },
    },
  })

  // Return the raw key only at creation time — never stored
  return NextResponse.json({ ...key, rawKey: raw }, { status: 201 })
}
