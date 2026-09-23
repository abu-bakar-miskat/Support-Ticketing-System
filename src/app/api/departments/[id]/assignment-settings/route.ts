import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canAdminDeptSettings, departmentIdInScope } from "@/lib/dept-scope"
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
    select: { id: true, assignmentMethod: true, manualAssigneeIds: true, workloadThreshold: true },
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
    select: { assignmentMethod: true, workloadThreshold: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const subDepartmentId = req.nextUrl.searchParams.get("subDepartmentId")
  if (subDepartmentId) {
    const subDept = await loadOwnedSubDepartment(id, subDepartmentId)
    if (!subDept) return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })
    return NextResponse.json({
      assignmentMethod: subDept.assignmentMethod,
      manualAssigneeIds: subDept.manualAssigneeIds,
      // A sub-department that inherits the method balances against the parent's
      // threshold, so surface both — the UI shows whichever is in effect.
      workloadThreshold: subDept.workloadThreshold,
      parentMethod: department.assignmentMethod,
      parentWorkloadThreshold: department.workloadThreshold,
    })
  }

  return NextResponse.json({
    assignmentMethod: department.assignmentMethod,
    workloadThreshold: department.workloadThreshold,
  })
}

/** PATCH /api/departments/:id/assignment-settings — change the assignment method. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canAdminDeptSettings(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const subDepartmentId = body.subDepartmentId as unknown
  const assignmentMethod = body.assignmentMethod as unknown
  const manualAssigneeIds = body.manualAssigneeIds as unknown
  const workloadThreshold = body.workloadThreshold as unknown

  const methodList = [...VALID_METHODS].join(", ")

  // Sub-department scope allows `null` (= inherit from parent) in addition to
  // the enum values; the department scope requires one of them.
  const isSubScoped = typeof subDepartmentId === "string" && subDepartmentId.length > 0
  // Either field may be updated on its own — changing only the threshold must
  // not require (or clobber) the method, and vice versa.
  const methodProvided = assignmentMethod !== undefined
  const thresholdProvided = workloadThreshold !== undefined
  if (!methodProvided && !thresholdProvided) {
    return NextResponse.json(
      { error: "Provide assignmentMethod and/or workloadThreshold." },
      { status: 400 },
    )
  }

  if (methodProvided) {
    const methodValid = isSubScoped
      ? assignmentMethod === null || (typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod))
      : typeof assignmentMethod === "string" && VALID_METHODS.has(assignmentMethod)
    if (!methodValid) {
      return NextResponse.json(
        {
          error: isSubScoped
            ? `assignmentMethod must be null (inherit) or one of ${methodList}`
            : `assignmentMethod must be one of ${methodList}`,
        },
        { status: 400 },
      )
    }
  }

  // WORKLOAD_BASED balancing threshold — a positive integer.
  let thresholdValue: number | undefined
  if (thresholdProvided) {
    if (
      typeof workloadThreshold !== "number" ||
      !Number.isInteger(workloadThreshold) ||
      workloadThreshold < 1 ||
      workloadThreshold > 1000
    ) {
      return NextResponse.json(
        { error: "workloadThreshold must be an integer between 1 and 1000." },
        { status: 400 },
      )
    }
    thresholdValue = workloadThreshold
  }

  // manualAssigneeIds is only meaningful for MANUAL_SELECT; when omitted it
  // defaults to the empty list. Must be an array of strings when provided.
  if (
    manualAssigneeIds !== undefined &&
    !(Array.isArray(manualAssigneeIds) && manualAssigneeIds.every((x) => typeof x === "string"))
  ) {
    return NextResponse.json({ error: "manualAssigneeIds must be an array of user IDs" }, { status: 400 })
  }
  // MANUAL_SELECT needs a member list, which only lives on the sub-department;
  // there's nowhere to store it at department scope.
  if (assignmentMethod === "MANUAL_SELECT" && !isSubScoped) {
    return NextResponse.json(
      { error: "The Manual (selected members) method can only be set on a sub-department." },
      { status: 400 },
    )
  }
  if (assignmentMethod === "MANUAL_SELECT" && (!Array.isArray(manualAssigneeIds) || manualAssigneeIds.length === 0)) {
    return NextResponse.json(
      { error: "Select at least one member for the Manual (selected members) method." },
      { status: 400 },
    )
  }

  if (isSubScoped) {
    const subDept = await loadOwnedSubDepartment(id, subDepartmentId as string)
    if (!subDept) return NextResponse.json({ error: "Sub-department not found" }, { status: 404 })

    const data: { assignmentMethod?: AssignmentMethod | null; manualAssigneeIds?: string[]; workloadThreshold?: number } = {}

    if (methodProvided) {
      // Persist the picked members only when MANUAL_SELECT is chosen; any other
      // method clears the list so a stale selection can't silently re-activate.
      let manualIds: string[] = []
      if (assignmentMethod === "MANUAL_SELECT") {
        const requested = [...new Set(manualAssigneeIds as string[])]
        const validMembers = await prisma.subDepartmentMembership.findMany({
          where: { subDepartmentId: subDept.id, isActive: true, userId: { in: requested } },
          select: { userId: true },
        })
        const validIds = new Set(validMembers.map((m) => m.userId))
        const invalid = requested.filter((uid) => !validIds.has(uid))
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: "Every selected member must be an active member of this sub-department." },
            { status: 400 },
          )
        }
        manualIds = requested
      }
      data.assignmentMethod = assignmentMethod as AssignmentMethod | null
      data.manualAssigneeIds = manualIds
    }
    if (thresholdValue !== undefined) data.workloadThreshold = thresholdValue

    const updated = await prisma.subDepartment.update({
      where: { id: subDept.id },
      data,
      select: { assignmentMethod: true, manualAssigneeIds: true, workloadThreshold: true },
    })
    return NextResponse.json(updated)
  }

  const data: { assignmentMethod?: AssignmentMethod; workloadThreshold?: number } = {}
  if (methodProvided) data.assignmentMethod = assignmentMethod as AssignmentMethod
  if (thresholdValue !== undefined) data.workloadThreshold = thresholdValue

  const updated = await prisma.department.update({
    where: { id },
    data,
    select: { assignmentMethod: true, workloadThreshold: true },
  })
  return NextResponse.json(updated)
}
