import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth, departmentAdminScope, assertDepartmentAdmin } from "@/lib/auth"
import { assertTemplateFeatureEnabled } from "@/lib/template-catalogue"
import { AssignmentMethod } from "@/generated/prisma/enums"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

/** Parses a per-form assignment-method override: null = inherit, a valid enum
 *  value = override, undefined = leave untouched (invalid values are ignored). */
function parseAssignmentMethod(value: unknown): AssignmentMethod | null | undefined {
  if (value === null) return null
  if (typeof value === "string" && VALID_METHODS.has(value)) return value as AssignmentMethod
  return undefined
}

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  // Intake forms are admin-only settings (role-hierarchy.md) — same scope as
  // PATCH/fields, not managerDeptScope (which also includes cross-access grants).
  const deptScope = departmentAdminScope(profile!)
  if (deptScope && deptScope.size === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const forms = await prisma.intakeFormConfig.findMany({
    where: deptScope
      ? { departmentId: { in: [...deptScope] } }
      : { department: { tenantId: profile!.activeTenantId ?? "__no_tenant__" } },
    orderBy: { createdAt: "desc" },
    include: {
      department: { select: { id: true, name: true } },
      intakeSubDepartment: { select: { id: true, name: true } },
      _count: { select: { intakes: true } },
    },
  })
  return NextResponse.json(forms)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const featureCheck = await assertTemplateFeatureEnabled(profile!.activeTenantId ?? "__no_tenant__", "supportForm")
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 })
  }

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const departmentId = (body.departmentId as string)?.trim()
  // Optional: a department-level form has no fixed sub-department; each issue
  // routes via its SLA policy. Only a fallback default when provided.
  const intakeSubDepartmentId = (body.intakeSubDepartmentId as string | null)?.trim() || null
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const assignmentMethod = parseAssignmentMethod(body.assignmentMethod)
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined
  // Owner level: a form created from a sub-department is SUB_DEPARTMENT-owned;
  // from the department it's DEPARTMENT-wide. Defaults to DEPARTMENT.
  const scope = body.scope === "SUB_DEPARTMENT" ? "SUB_DEPARTMENT" : "DEPARTMENT"

  if (!name || !departmentId) {
    return NextResponse.json(
      { error: "name and departmentId are required" },
      { status: 400 },
    )
  }

  const adminError = assertDepartmentAdmin(profile!, departmentId)
  if (adminError) return adminError

  // When a fallback default sub-department is provided, verify it belongs to the
  // department. Department-level forms leave it null and route by issue instead.
  if (intakeSubDepartmentId) {
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: intakeSubDepartmentId },
      select: { departmentId: true },
    })
    if (!subDepartment) {
      return NextResponse.json({ error: "Intake subDepartment not found" }, { status: 404 })
    }
    if (subDepartment.departmentId !== departmentId) {
      return NextResponse.json(
        { error: "Intake subDepartment must belong to the selected department" },
        { status: 400 },
      )
    }
  }

  const form = await prisma.intakeFormConfig.create({
    data: {
      name,
      departmentId,
      intakeSubDepartmentId,
      scope,
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(assignmentMethod !== undefined ? { assignmentMethod } : {}),
      ...(displayMode !== undefined ? { displayMode } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      intakeSubDepartment: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(form, { status: 201 })
}
