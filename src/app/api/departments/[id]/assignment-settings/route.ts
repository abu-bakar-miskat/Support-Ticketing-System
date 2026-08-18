import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import { AssignmentMethod } from "@/generated/prisma/enums"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

/** GET /api/departments/:id/assignment-settings — the department's assignment method (ASG-01). */
export async function GET(
  _req: NextRequest,
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
  const assignmentMethod = body.assignmentMethod as unknown
  if (typeof assignmentMethod !== "string" || !VALID_METHODS.has(assignmentMethod)) {
    return NextResponse.json(
      { error: "assignmentMethod must be one of RULE_BASED, ROUND_ROBIN, WORKLOAD_BASED, MANUAL" },
      { status: 400 },
    )
  }

  const updated = await prisma.department.update({
    where: { id },
    data: { assignmentMethod: assignmentMethod as AssignmentMethod },
    select: { assignmentMethod: true },
  })
  return NextResponse.json(updated)
}
