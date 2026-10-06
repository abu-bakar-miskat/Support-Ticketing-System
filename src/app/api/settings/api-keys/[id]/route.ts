import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"
import { prisma } from "@/lib/db"

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
// DELETE /api/settings/api-keys/:id?permanent=true — delete a portal key and its empty linked form
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
      const [submissionCount, pendingCount] = await Promise.all([
        prisma.intake.count({ where: { formConfigId: key.formConfigId } }),
        prisma.pendingIntake.count({ where: { formConfigId: key.formConfigId } }),
      ])
      if (submissionCount > 0 || pendingCount > 0) {
        return NextResponse.json(
          {
            error: "This connection has submission history and cannot be deleted. Revoke it instead.",
          },
          { status: 409 },
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.apiKey.delete({ where: { id } })
      if (key.formConfigId) {
        await tx.slaPolicy.deleteMany({ where: { formConfigId: key.formConfigId } })
        await tx.intakeFormConfig.delete({ where: { id: key.formConfigId } })
      }
    })
    return NextResponse.json({ ok: true })
  }

  if (key.revokedAt !== null) {
    return NextResponse.json({ error: "Key is already revoked" }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
    if (key.formConfigId) {
      await tx.intakeFormConfig.update({
        where: { id: key.formConfigId },
        data: { isActive: false },
      })
    }
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
  if ((body as { action?: unknown } | null)?.action !== "restore") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  }

  const loaded = await loadManageableKey(id)
  if ("error" in loaded) return loaded.error
  const { key } = loaded

  if (key.revokedAt === null) {
    return NextResponse.json({ error: "Key is not revoked" }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({
      where: { id },
      data: { revokedAt: null },
    })
    if (key.formConfigId) {
      await tx.intakeFormConfig.update({
        where: { id: key.formConfigId },
        data: { isActive: true },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
