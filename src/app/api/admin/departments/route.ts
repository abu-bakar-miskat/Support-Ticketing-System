import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdmin } from "../_guard"
import { isValidDepartmentType, DEFAULT_DEPARTMENT_TYPE } from "@/lib/department-types"
import { resolveSupportProjectForDepartment } from "@/lib/support-project"

export async function GET() {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const departments = await prisma.department.findMany({
    where: { tenantId: profile.activeTenantId ?? "__no_tenant__" },
    orderBy: { name: "asc" },
    include: { _count: { select: { teams: true } } },
  })
  return NextResponse.json(departments)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const name = (body.name as string)?.trim()
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const rawType = (body.type as string | undefined)?.trim()
  if (rawType !== undefined && !isValidDepartmentType(rawType)) {
    return NextResponse.json({ error: "Invalid department type" }, { status: 400 })
  }
  const type = rawType ?? DEFAULT_DEPARTMENT_TYPE

  const tenantId = profile.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 400 })
  }

  // Keep isHub in sync so the existing hub-scope logic keeps working.
  const department = await prisma.department.create({
    data: { name, tenantId, type, isHub: type === "hub" },
  })

  // A support department is intake-driven — give it its support project up front.
  if (type === "support") {
    await resolveSupportProjectForDepartment(department.id).catch((e) =>
      console.error("[POST /api/admin/departments] support project seed failed:", e),
    )
  }

  return NextResponse.json(department, { status: 201 })
}
