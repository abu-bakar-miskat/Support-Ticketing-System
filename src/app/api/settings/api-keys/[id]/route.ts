import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"
import { prisma } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"

async function loadManageableKey(id: string) {
  const { profile, error } = await requireAdmin()
  if (error) return { error }

  const key = await prisma.apiKey.findUnique({
    where: { id },
    select: {
      id: true,
      revokedAt: true,
      tenantId: true,
      departmentId: true,
      formConfigId: true,
      kind: true,
      department: { select: { tenantId: true } },
    },
  })

  const keyTenantId = key?.tenantId ?? key?.department?.tenantId ?? null
  if (!key || !profile?.activeTenantId || keyTenantId !== profile.activeTenantId) {
    return { error: NextResponse.json({ error: "API key not found" }, { status: 404 }) }
  }
  if (
    !isActiveTenantAdmin(profile) &&
    (!key.departmentId || !(profile.departmentAdminIds ?? []).includes(key.departmentId))
  ) {
    return { error: NextResponse.json({ error: "API key not found" }, { status: 404 }) }
  }

  return { profile, key }
}

// DELETE /api/settings/api-keys/:id — revoke a key
// DELETE /api/settings/api-keys/:id?permanent=true — delete an unused portal key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const loaded = await loadManageableKey(id)
  if ("error" in loaded) return loaded.error
  const { profile, key } = loaded

  if (request.nextUrl.searchParams.get("permanent") === "true") {
    if (key.kind !== "portal" || !isActiveTenantAdmin(profile)) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (key.formConfigId) {
      const submissionCount = await prisma.intake.count({ where: { apiKeyId: id } })
      if (submissionCount > 0) {
        return NextResponse.json(
          {
            error: "This connection has submission history and cannot be deleted. Revoke it instead.",
          },
          { status: 409 },
        )
      }
    }

    await prisma.apiKey.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  }

  if (key.revokedAt !== null) {
    return NextResponse.json({ error: "Key is already revoked" }, { status: 409 })
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

// PATCH /api/settings/api-keys/:id { action: "restore" } — un-revoke a key
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const action = (body as { action?: unknown } | null)?.action
  if (action !== "restore" && action !== "update-form") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  }

  const loaded = await loadManageableKey(id)
  if ("error" in loaded) return loaded.error
  const { key, profile } = loaded

  if (action === "update-form") {
    if (key.kind !== "portal" || !isActiveTenantAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : ""
    const formConfigId = typeof body.formConfigId === "string" ? body.formConfigId.trim() : ""
    if (!departmentId || !formConfigId) {
      return NextResponse.json({ error: "Department and support form are required" }, { status: 400 })
    }
    const form = await prisma.intakeFormConfig.findFirst({
      where: { id: formConfigId, departmentId, department: { tenantId: profile.activeTenantId! } },
      select: { id: true, isActive: true, apiKey: { select: { id: true } } },
    })
    if (!form) {
      return NextResponse.json({ error: "Support form not found in this department" }, { status: 404 })
    }
    if (form.id === key.formConfigId) return NextResponse.json({ ok: true })
    if (!form.isActive) {
      return NextResponse.json({ error: "Select an active support form" }, { status: 409 })
    }
    if (form.apiKey && form.apiKey.id !== key.id) {
      return NextResponse.json({ error: "This support form is already connected to an API key" }, { status: 409 })
    }
    try {
      await prisma.apiKey.update({ where: { id }, data: { formConfigId: form.id } })
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
        return NextResponse.json({ error: "This support form is already connected to an API key" }, { status: 409 })
      }
      throw cause
    }
    return NextResponse.json({ ok: true })
  }

  if (key.revokedAt === null) {
    return NextResponse.json({ error: "Key is not revoked" }, { status: 409 })
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: null },
  })

  return NextResponse.json({ ok: true })
}
