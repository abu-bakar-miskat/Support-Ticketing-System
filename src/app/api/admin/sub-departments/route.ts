import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { departmentTenantId } from "@/lib/tenant-scope"

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function createBoardForTeam(teamId: string, name: string, color: string, departmentId: string, tenantId: string) {
  const baseSlug = slugify(name) || teamId
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    try {
      return await prisma.project.create({
        data: { name, slug, color, teamId, departmentId, tenantId },
      })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
  }
  throw new Error(`Could not generate a unique project slug for team ${teamId}`)
}

export async function GET() {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const deptScope = managerDeptScope(profile!)
  const teams = await prisma.team.findMany({
    where: deptScope
      ? { departmentId: { in: [...deptScope] } }
      : { tenantId: profile!.activeTenantId ?? "__no_tenant__" },
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { tickets: true, profiles: true } },
    },
  })
  return NextResponse.json(teams)
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
  // Cross-access grants do not allow creating teams in another department
  if (!isAdmin && profile?.role === "manager") {
    const directlyManages = (profile.managedDepartmentIds ?? []).includes(departmentId)
    if (!directlyManages) {
      return NextResponse.json({ error: "Forbidden: cross-access does not allow creating teams" }, { status: 403 })
    }
  }

  const color = (body.color as string | undefined)?.trim() || "#0a76b9"

  const tenantId = await departmentTenantId(departmentId)
  if (!tenantId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  try {
    const team = await prisma.team.create({
      data: { name, prefix, color, departmentId, tenantId },
      include: { department: { select: { id: true, name: true } } },
    })
    // Every team gets its own board (project) automatically. No members are
    // assigned here — access is governed by team/department scope, not
    // explicit board membership.
    await createBoardForTeam(team.id, name, color, departmentId, tenantId)
    return NextResponse.json(team, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A team with that prefix already exists" }, { status: 409 })
    }
    throw e
  }
}
