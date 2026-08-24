import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { AssignmentMethod } from "@/generated/prisma/enums"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

/**
 * Per-support-form assignment methods (see IntakeFormConfig.assignmentMethod).
 * A form's own method overrides its sub-department's (and the department's) —
 * see lib/assignment-engine.ts. null on a form = inherit that resolved method.
 *
 * GET  /api/departments/:id/form-assignment-methods?subDepartmentId=X
 *   → { inheritedMethod, forms: [{ id, name, assignmentMethod }] }
 *      `inheritedMethod` is what a null form resolves to (sub-dept → dept →
 *      ROUND_ROBIN), shown in the UI as the "Inherit" fallback.
 * PATCH { formConfigId, assignmentMethod: null | Method, subDepartmentId }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rawSub = req.nextUrl.searchParams.get("subDepartmentId")
  const subDepartmentId = rawSub && rawSub.trim() ? rawSub.trim() : null

  const [department, subDept, forms] = await Promise.all([
    prisma.department.findUnique({ where: { id }, select: { assignmentMethod: true } }),
    subDepartmentId
      ? prisma.subDepartment.findFirst({
          where: { id: subDepartmentId, departmentId: id },
          select: { assignmentMethod: true },
        })
      : Promise.resolve(null),
    prisma.intakeFormConfig.findMany({
      where: {
        departmentId: id,
        ...(subDepartmentId ? { intakeSubDepartmentId: subDepartmentId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, assignmentMethod: true },
    }),
  ])
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })
  if (subDepartmentId && !subDept) {
    return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
  }

  const inheritedMethod: AssignmentMethod =
    subDept?.assignmentMethod ?? department.assignmentMethod ?? "ROUND_ROBIN"

  return NextResponse.json({ inheritedMethod, forms })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const formConfigId = body.formConfigId as unknown
  const assignmentMethod = body.assignmentMethod as unknown

  if (typeof formConfigId !== "string" || formConfigId.length === 0) {
    return NextResponse.json({ error: "formConfigId is required" }, { status: 400 })
  }
  // null = inherit; otherwise must be one of the four methods.
  const methodValid =
    assignmentMethod === null ||
    (typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod))
  if (!methodValid) {
    return NextResponse.json(
      { error: "assignmentMethod must be null (inherit) or one of RULE_BASED, ROUND_ROBIN, WORKLOAD_BASED, MANUAL" },
      { status: 400 },
    )
  }

  // The form must belong to this department (scope guard).
  const form = await prisma.intakeFormConfig.findFirst({
    where: { id: formConfigId, departmentId: id },
    select: { id: true },
  })
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })

  const updated = await prisma.intakeFormConfig.update({
    where: { id: form.id },
    data: { assignmentMethod: assignmentMethod as AssignmentMethod | null },
    select: { id: true, name: true, assignmentMethod: true },
  })
  return NextResponse.json(updated)
}
