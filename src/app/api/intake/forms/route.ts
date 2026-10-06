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
    // Portal API key forms are managed on Generate API, not Support Forms.
    where: deptScope
      ? { departmentId: { in: [...deptScope] }, apiKey: { is: null } }
      : { department: { tenantId: profile!.activeTenantId ?? "__no_tenant__" }, apiKey: { is: null } },
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
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const assignmentMethod = parseAssignmentMethod(body.assignmentMethod)
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined

  if (!name || !departmentId) {
    return NextResponse.json(
      { error: "name and departmentId are required" },
      { status: 400 },
    )
  }

  const adminError = assertDepartmentAdmin(profile!, departmentId)
  if (adminError) return adminError

  // Support forms are always department-scoped — there are no sub-department
  // forms. Tickets are routed to a sub-department at submit time by the chosen
  // issue's SLA policy (see intake-finalize.ts), falling back to the
  // department's default sub-department.
  const form = await prisma.intakeFormConfig.create({
    data: {
      name,
      departmentId,
      intakeSubDepartmentId: null,
      scope: "DEPARTMENT",
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
