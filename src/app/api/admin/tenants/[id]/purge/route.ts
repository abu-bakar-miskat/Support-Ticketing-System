import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { purgeTenant } from "@/lib/tenant-lifecycle"

type Params = { params: Promise<{ id: string }> }

/**
 * DELETE /api/admin/tenants/:id/purge — PERMANENTLY delete an already
 * soft-deleted tenant and all of its data (SA-01). Irreversible. Super-admin
 * only. Requires `{ confirmSlug }` in the body to match the tenant's slug.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const confirmSlug = typeof body.confirmSlug === "string" ? body.confirmSlug : ""
  if (!confirmSlug) return badRequest("confirmSlug is required to permanently delete a tenant")

  try {
    const result = await purgeTenant({ tenantId: id, actorId: profile!.id, confirmSlug })
    if (!result) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to permanently delete tenant"
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
