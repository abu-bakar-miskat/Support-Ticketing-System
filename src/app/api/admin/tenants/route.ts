import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { isValidTenantType, DEFAULT_TENANT_TYPE } from "@/lib/tenant-types"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// List every tenant (super-admin only) with a little structure count.
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      status: true,
      createdAt: true,
      _count: { select: { departments: true, memberships: true } },
    },
  })
  return NextResponse.json(tenants)
}

// Create a new, independent tenant seeded with a default department.
export async function POST(request: Request) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = (body.name as string | undefined)?.trim()
  if (!name) return badRequest("Name is required")

  const slug = ((body.slug as string | undefined)?.trim() || slugify(name)).toLowerCase()
  if (!slug) return badRequest("Could not derive a slug from the name")

  const rawType = (body.type as string | undefined)?.trim()
  if (rawType !== undefined && !isValidTenantType(rawType)) return badRequest("Invalid tenant type")
  const type = rawType ?? DEFAULT_TENANT_TYPE

  const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
  if (existing) return NextResponse.json({ error: "A tenant with that slug already exists" }, { status: 409 })

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      type,
      departments: { create: { name: "General" } },
      // Seed the creating admin as a member so the tenant isn't born empty —
      // otherwise nobody can be added to its departments (no bootstrap member
      // to grant membership from).
      memberships: { create: { userId: profile!.id, role: "admin", isActive: true } },
    },
    select: { id: true, slug: true, name: true, type: true, status: true, createdAt: true },
  })

  return NextResponse.json(tenant, { status: 201 })
}
