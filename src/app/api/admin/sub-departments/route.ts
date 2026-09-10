import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { departmentTenantId } from "@/lib/tenant-scope"
import { seedSubDepartmentStatuses } from "@/lib/board-columns"

/** URL-safe slug from a name (mirrors scripts/backfill-subdepartment-slugs.ts). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "team"
  )
}

/** A slug unique within the department, suffixing -2, -3… on collision. */
async function uniqueSubDepartmentSlug(
  departmentId: string,
  name: string,
): Promise<string> {
  const base = slugify(name)
  const existing = await prisma.subDepartment.findMany({
    where: { departmentId, slug: { startsWith: base } },
    select: { slug: true },
  })
  const used = new Set(existing.map((s) => s.slug).filter(Boolean) as string[])
  let slug = base
  let i = 2
  while (used.has(slug)) slug = `${base}-${i++}`
  return slug
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

export async function GET() {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const deptScope = managerDeptScope(profile!)
  const subDepartments = await prisma.subDepartment.findMany({
    where: deptScope
      ? { departmentId: { in: [...deptScope] } }
      : { tenantId: profile!.activeTenantId ?? "__no_tenant__" },
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { tickets: true, profiles: true } },
    },
  })
  return NextResponse.json(subDepartments)
}

export async function POST(request: Request) {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const prefix = (body.prefix as string)?.trim().toUpperCase()
  const departmentId = (body.departmentId as string)?.trim()

  if (!name || !prefix || !departmentId) {
    return NextResponse.json({ error: "name, prefix, and departmentId are required" }, { status: 400 })
  }
  if (prefix.length < 2 || prefix.length > 5) {
    return NextResponse.json({ error: "Prefix must be 2–5 characters" }, { status: 400 })
  }
  if (!/^[A-Z]+$/.test(prefix)) {
    return NextResponse.json({ error: "Prefix must contain only letters" }, { status: 400 })
  }

  const deptScope = managerDeptScope(profile!)
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json({ error: "Forbidden: department is outside your scope" }, { status: 403 })
  }
  // Cross-access grants do not allow creating sub departments in another department
  if (!isAdmin && profile?.role === "manager") {
    const directlyManages = (profile.managedDepartmentIds ?? []).includes(departmentId)
    if (!directlyManages) {
      return NextResponse.json({ error: "Forbidden: cross-access does not allow creating sub departments" }, { status: 403 })
    }
  }

  const color = (body.color as string | undefined)?.trim() || "#0a76b9"

  const tenantId = await departmentTenantId(departmentId)
  if (!tenantId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  try {
    const slug = await uniqueSubDepartmentSlug(departmentId, name)
    const subDepartment = await prisma.subDepartment.create({
      data: { name, prefix, color, departmentId, tenantId, slug },
      include: { department: { select: { id: true, name: true } } },
    })
    // Seed the default statuses (OPEN/IN PROGRESS/PAUSED/ESCALATED/RESOLVED) so
    // a new sub-department mirrors the department's default board until it's
    // given its own. Idempotent + best-effort — never fails sub-department creation.
    await seedSubDepartmentStatuses(prisma, subDepartment.id).catch((e) =>
      console.error("[POST /api/admin/sub-departments] default statuses seed failed:", e),
    )
    // Note: support intake forms are no longer auto-created here. Admins/managers
    // create them explicitly via the support forms UI.
    return NextResponse.json(subDepartment, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A subDepartment with that prefix already exists" }, { status: 409 })
    }
    throw e
  }
}
