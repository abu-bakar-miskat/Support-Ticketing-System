import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { isValidTenantType } from "@/lib/tenant-types"

type Params = { params: Promise<{ id: string }> }

/** Update tenant identity fields (currently: type). Super-admin only. */
export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: { type?: string } = {}
  if (body.type !== undefined) {
    if (!isValidTenantType(body.type)) return badRequest("Invalid tenant type")
    data.type = body.type
  }
  if (Object.keys(data).length === 0) return badRequest("No fields to update")

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const updated = await prisma.tenant.update({
    where: { id },
    data,
    select: { id: true, slug: true, name: true, type: true, status: true },
  })
  return NextResponse.json(updated)
}
