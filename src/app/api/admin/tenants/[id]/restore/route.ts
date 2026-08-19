import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { restoreTenant } from "@/lib/tenant-lifecycle"

type Params = { params: Promise<{ id: string }> }

/** POST /api/admin/tenants/:id/restore — reverse a soft-delete (SA-01). Super-admin only. */
export async function POST(_request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const updated = await restoreTenant({ tenantId: id, actorId: profile!.id })
  if (!updated) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  return NextResponse.json(updated)
}
