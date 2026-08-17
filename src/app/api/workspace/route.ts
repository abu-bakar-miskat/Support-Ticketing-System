import { NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { updateTenantConfig, getTenantConfig, TENANT_JSON_CONFIG_KEYS } from "@/lib/tenant-config"

/** Managers may only update email settings; other tenant config stays admin-only. */
const MANAGER_ALLOWED_KEYS = new Set(["emailConfig"])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Update the ACTIVE TENANT's settings (email / time-tracking / approvals, and
 * the tenant name). Formerly targeted the global Workspace singleton; tenant
 * config is now per-tenant. Managers may only touch emailConfig.
 */
export async function PATCH(request: Request) {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const tenantId = profile.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const patch: Parameters<typeof updateTenantConfig>[1] = {}

  if (body.name !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can update the tenant name" }, { status: 403 })
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 })
    }
    patch.name = body.name.trim()
  }

  for (const key of TENANT_JSON_CONFIG_KEYS) {
    if (body[key] === undefined) continue
    if (!isAdmin && !MANAGER_ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: `Only admins can update ${key}` }, { status: 403 })
    }
    if (!isPlainObject(body[key])) {
      return NextResponse.json({ error: `${key} must be an object` }, { status: 400 })
    }
    patch[key] = body[key] as Record<string, unknown>
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  await updateTenantConfig(tenantId, patch)
  const updated = await getTenantConfig(tenantId)
  return NextResponse.json(updated)
}
