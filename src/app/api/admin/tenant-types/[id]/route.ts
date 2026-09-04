import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"

type Params = { params: Promise<{ id: string }> }

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002"
}

/** Update a tenant type's key/label/description. Super-admin only. */
export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const label = typeof body.label === "string" ? body.label.trim() : undefined
  const key = typeof body.key === "string" ? body.key.trim().toLowerCase() : undefined
  const description =
    body.description === undefined
      ? undefined
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null

  if (label === undefined && key === undefined && description === undefined) {
    return badRequest("No fields to update")
  }
  if (label !== undefined && !label) return badRequest("Label cannot be empty")
  if (key !== undefined && !KEY_RE.test(key)) {
    return badRequest("Key must be lowercase letters, numbers, and hyphens")
  }

  const existing = await prisma.tenantType.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Tenant type not found" }, { status: 404 })

  const data: { label?: string; key?: string; description?: string | null } = {}
  if (label !== undefined) data.label = label
  if (key !== undefined) data.key = key
  if (description !== undefined) data.description = description

  try {
    const updated = await prisma.tenantType.update({
      where: { id },
      data,
      select: { id: true, key: true, label: true, description: true, createdAt: true },
    })
    return NextResponse.json(updated)
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A tenant type with that key already exists" }, { status: 409 })
    }
    throw e
  }
}

/** Delete a tenant type. Blocked while any tenant still uses its key. Super-admin only. */
export async function DELETE(_request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params

  const existing = await prisma.tenantType.findUnique({ where: { id }, select: { key: true } })
  if (!existing) return NextResponse.json({ error: "Tenant type not found" }, { status: 404 })

  const inUse = await prisma.tenant.count({ where: { type: existing.key } })
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Can't delete — ${inUse} tenant${inUse === 1 ? "" : "s"} still use this type` },
      { status: 409 },
    )
  }

  await prisma.tenantType.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
