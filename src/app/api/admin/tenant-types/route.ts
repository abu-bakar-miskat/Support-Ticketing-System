import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002"
}

// List the tenant-type catalog (super-admin only).
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const types = await prisma.tenantType.findMany({
    orderBy: { label: "asc" },
    select: { id: true, key: true, label: true, description: true, createdAt: true },
  })
  return NextResponse.json(types)
}

// Create a tenant type. `key` is the stable slug stored on Tenant.type; it's
// derived from the label when not supplied.
export async function POST(request: Request) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const label = (body.label as string | undefined)?.trim()
  if (!label) return badRequest("Label is required")

  const key = ((body.key as string | undefined)?.trim() || slugify(label)).toLowerCase()
  if (!key) return badRequest("Could not derive a key from the label")
  if (!KEY_RE.test(key)) return badRequest("Key must be lowercase letters, numbers, and hyphens")

  const description = typeof body.description === "string" ? body.description.trim() || null : null

  try {
    const created = await prisma.tenantType.create({
      data: { key, label, description },
      select: { id: true, key: true, label: true, description: true, createdAt: true },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A tenant type with that key already exists" }, { status: 409 })
    }
    throw e
  }
}
