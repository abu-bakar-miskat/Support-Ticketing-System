import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { AssignmentMethod } from "@/generated/prisma/enums"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

/**
 * Confirm a sub-department belongs to the given department. Returns the
 * sub-department row (with its assignment override) or null when it does not
 * exist / is out of the department's tree — callers 404 on null.
 */
async function loadOwnedSubDepartment(departmentId: string, subDepartmentId: string) {
  return prisma.subDepartment.findFirst({
    where: { id: subDepartmentId, departmentId },
    select: { id: true, assignmentMethod: true },
  })
}

/**
 * GET /api/departments/:id/assignment-settings — the assignment method (ASG-01).
 * With `?subDepartmentId=`, returns that sub-department's override
 * (`assignmentMethod` may be null = inherit) alongside the parent's method.
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

  const department = await prisma.department.findUnique({
    where: { id },
    select: { assignmentMethod: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const subDepartmentId = req.nextUrl.searchParams.get("subDepartmentId")
  if (subDepartmentId) {
    const subDept = await loadOwnedSubDepartment(id, subDepartmentId)
    if (!subDept) return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
    return NextResponse.json({
      assignmentMethod: subDept.assignmentMethod,
      parentMethod: department.assignmentMethod,
    })
  }

  return NextResponse.json({ assignmentMethod: department.assignmentMethod })
}

/** PATCH /api/departments/:id/assignment-settings — change the assignment method. */
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
  const subDepartmentId = body.subDepartmentId as unknown
  const assignmentMethod = body.assignmentMethod as unknown

  // Sub-department scope allows `null` (= inherit from parent) in addition to
  // the four enum values; the department scope requires one of the four.
  const isSubScoped = typeof subDepartmentId === "string" && subDepartmentId.length > 0
  const methodValid = isSubScoped
    ? assignmentMethod === null || (typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod))
    : typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod)
  if (!methodValid) {
    return NextResponse.json(
      {
        error: isSubScoped
          ? "assignmentMethod must be null (inherit) or one of RULE_BASED, ROUND_ROBIN, WORKLOAD_BASED, MANUAL"
          : "assignmentMethod must be one of RULE_BASED, ROUND_ROBIN, WORKLOAD_BASED, MANUAL",
      },
      { status: 400 },
    )
  }

  if (isSubScoped) {
    const subDept = await loadOwnedSubDepartment(id, subDepartmentId as string)
    if (!subDept) return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
    const updated = await prisma.subDepartment.update({
      where: { id: subDept.id },
      data: { assignmentMethod: (assignmentMethod as AssignmentMethod | null) },
      select: { assignmentMethod: true },
    })
    return NextResponse.json(updated)
  }

  const updated = await prisma.department.update({
    where: { id },
    data: { assignmentMethod: assignmentMethod as AssignmentMethod },
    select: { assignmentMethod: true },
  })
  return NextResponse.json(updated)
}
